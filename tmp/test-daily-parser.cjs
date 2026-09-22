const { JSDOM } = require('jsdom');

// Let's test with minimal HTML structure matching the user's snippet
const html = `<!DOCTYPE html> <html lang=ja>
<head><title> 2026/9/20(日) </title></head>
<body>
<ol class=breadcrumb>
<li id=panHome><a href="/"><span itemprop=name> HOME</span></a></li>
<li><a href="/hole/tokyo/"><span itemprop=name>東京都</span></a></li>
<li><a href="/hole/kamata7/"><span itemprop=name>マルハンメガシティ2000蒲田7</span></a></li>
<li><span itemprop=name> 2026-9-20 </span></li>
</ol>
<h4 class=title align=center><strong>
 2026/9/20(日)
<br>マルハンメガシティ2000蒲田7
 </strong></h4>
<h5 class="wp-block-heading has-text-align-center"><strong>全体結果</strong></h5>
<figure class="wp-block-table aligncenter"><table><tbody>
<tr><th>総差枚</th><th>平均差枚</th><th>平均G数</th><th>勝率</th></tr>
<tr><td>-20,200</td><td>-28</td><td>3,980</td><td>262/715</td></tr>
</tbody></table></figure>

<h5 class="wp-block-heading has-text-align-left"><strong>機種別データ</strong></h5>
<figure class=wp-block-table2><table><tbody>
<tr><th>機種</th><th>平均差枚</th><th>平均G数</th><th>勝率</th></tr>
<tr><td><a href="...">Lパチスロガールズ＆パンツァー 最終章</a></td><td>+4,000</td><td>1,909</td><td>1/3</td></tr>
<tr><td><a href="...">L邪神ちゃんドロップキック</a></td><td>+1,800</td><td>6,117</td><td>3/4</td></tr>
</tbody></table></figure>

<h5 class="wp-block-heading has-text-align-left"><strong>少台数機種（2台以下）</strong></h5>
<figure class=wp-block-table2><table><tbody>
<tr><th>機種</th><th>平均差枚</th><th>平均G数</th><th>勝率</th></tr>
<tr><td><a href="...">Lバンドリ！</a></td><td>+3,950</td><td>3,689</td><td>1/2</td></tr>
</tbody></table></figure>

<h5 class="wp-block-heading has-text-align-center"><strong>末尾別結果</strong></h5>
<figure class=wp-block-table><table><tbody>
<tr><th>末尾番号</th><th>平均差枚</th><th>平均G数</th><th>勝率</th></tr>
<tr><td><a href="...">末尾0</a></td><td>-56</td><td>4,007</td><td>28/72</td></tr>
<tr><td><a href="...">末尾1</a></td><td>-297</td><td>4,200</td><td>25/74</td></tr>
<tr><td><a href="...">末尾ゾロ目</a></td><td>-154</td><td>3,924</td><td>29/70</td></tr>
</tbody></table></figure>
</body>
</html>`;

const dom = new JSDOM(html);
const doc = dom.window.document;

console.log("Testing DOM extraction...");
let storeName = '';
const breadcrumbs = Array.from(doc.querySelectorAll('ol.breadcrumb li, .breadcrumb li'));
if (breadcrumbs.length >= 2) {
  const storeLi = breadcrumbs[breadcrumbs.length - 2];
  storeName = storeLi.textContent?.trim() || '';
}
if (!storeName) {
  const h4 = doc.querySelector('h4.title');
  if (h4) {
    const lines = h4.innerHTML.split(/<br\s*\/?>/i);
    if (lines.length >= 2) {
      storeName = lines[1].replace(/<[^>]*>/g, '').trim();
    }
  }
}
console.log("Store name:", storeName);

// Date
let dateStr = '';
const textWithDate = doc.querySelector('h4.title')?.textContent || doc.title || '';
const dateMatch = textWithDate.match(/(202\d)[年/-](\d{1,2})[月/-](\d{1,2})/);
if (dateMatch) {
  dateStr = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
}
console.log("Date:", dateStr);

// Overall table
let totalDiff = 0;
let avgDiff = 0;
let avgGames = 0;
let winMachines = 0;
let totalMachines = 0;

const headings = Array.from(doc.querySelectorAll('h4, h5, h6, p, div'));
const overallHeading = headings.find(h => h.textContent?.includes('全体結果'));
if (overallHeading) {
  let el = overallHeading.nextElementSibling;
  while (el && !el.querySelector('table')) {
    el = el.nextElementSibling;
  }
  const table = el?.querySelector('table');
  if (table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    const dataRow = rows.find(r => r.querySelectorAll('td').length >= 3);
    if (dataRow) {
      const tds = dataRow.querySelectorAll('td');
      totalDiff = parseInt(tds[0].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
      avgDiff = parseInt(tds[1].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
      avgGames = parseInt(tds[2].textContent?.replace(/[,+]/g, '').trim() || '0', 10);
      const wrMatch = tds[3].textContent?.match(/(\d+)\s*[\/／]\s*(\d+)/);
      if (wrMatch) {
        winMachines = parseInt(wrMatch[1], 10);
        totalMachines = parseInt(wrMatch[2], 10);
      }
    }
  }
}
console.log({ totalDiff, avgDiff, avgGames, winMachines, totalMachines });
