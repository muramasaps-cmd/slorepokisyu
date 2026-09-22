// Save the exact HTML snippet from the user prompt to test parsing
const fs = require('fs');

const htmlSample = `<!DOCTYPE html> <html lang=ja style><!--
 Page saved with SingleFile 
 url: https://www.slorepo.com/hole/e3839ee383abe3838fe383b3e383a1e382ace382b7e38386e382a332303030e892b2e794b037code/20260920/ 
 saved date: Tue Sep 22 2026 11:39:42 GMT+0900 (日本標準時)
--><meta charset=utf-8>
<title>
 2026/9/20(日)
 </title>
<body>
<h4 class=title align=center><strong>
 2026/9/20(日)
<br>マルハンメガシティ2000蒲田7
 </strong></h4>
<h5 class="wp-block-heading has-text-align-center"><strong>全体結果</strong></h5>
<figure class="wp-block-table aligncenter"><table><tbody><tr><th class=has-text-align-center data-align=center style="border-left:1px solid #000080;border-top:1px solid #000080;background-color:#1a1a1a">総差枚<th class=has-text-align-center data-align=center style="border-top:1px solid #000080;background-color:#1a1a1a">平均差枚<th class=has-text-align-center data-align=center style="border-top:1px solid #000080;background-color:#1a1a1a">平均G数<th class=has-text-align-center data-align=center style="border-right:1px solid #000080;border-top:1px solid #000080;background-color:#1a1a1a">勝率<tr><td class=has-text-align-center data-align=center>-20,200
<td class=has-text-align-center data-align=center>-28
<td class=has-text-align-center data-align=center>3,980
<td class=has-text-align-center data-align=center>262/715
</table></figure>

<h5 class="wp-block-heading has-text-align-left"><strong>機種別データ</strong></h5>
<figure class=wp-block-table2 style=margin-bottom:7px><table><tbody><tr><th class=has-text-align-center data-align=center style="border:1px solid #FFFFFF;border-left:1px solid #000080;border-top:1px solid #000080">機種<th class=has-text-align-center data-align=center style="border:1px solid #FFFFFF;border-top:1px solid #000080">平均差枚<th class=has-text-align-center data-align=center style="border:1px solid #FFFFFF;border-top:1px solid #000080">平均G数<th class=has-text-align-center data-align=center style="border:1px solid #FFFFFF;border-right:1px solid #000080;border-top:1px solid #000080">勝率</tr>
 <tr><td style="border:1px solid #696969"><a href="...">Lパチスロガールズ＆パンツァー 最終章</a><td class=has-text-align-right data-align=right style="border:1px solid #696969"><strong><font color=blue>+4,000</font></strong><td class=has-text-align-right data-align=right style="border:1px solid #696969">1,909<td class=has-text-align-center data-align=center style="border:1px solid #696969">1/3</tr>
 <tr><td style="border:1px solid #696969"><a href="...">L邪神ちゃんドロップキック</a><td class=has-text-align-right data-align=right style="border:1px solid #696969"><strong><font color=blue>+1,800</font></strong><td class=has-text-align-right data-align=right style="border:1px solid #696969">6,117<td class=has-text-align-center data-align=center style="border:1px solid #696969">3/4</tr>
</table></figure>

<h5 class="wp-block-heading has-text-align-left" style=margin-top:10px><strong>少台数機種（2台以下）</strong></h5>
<figure class=wp-block-table2><table><tbody><tr><th class=has-text-align-center data-align=center style="border:1px solid #FFFFFF;border-left:1px solid #000080;border-top:1px solid #000080">機種<th class=has-text-align-center data-align=center style="border:1px solid #FFFFFF;border-top:1px solid #000080">平均差枚<th class=has-text-align-center data-align=center style="border:1px solid #FFFFFF;border-top:1px solid #000080">平均G数<th class=has-text-align-center data-align=center style="border:1px solid #FFFFFF;border-right:1px solid #000080;border-top:1px solid #000080">勝率</tr>
 <tr><td style="border:1px solid #696969"><a href="...">Lバンドリ！</a><td class=has-text-align-right data-align=right style="border:1px solid #696969"><strong><font color=blue>+3,950</font></strong><td class=has-text-align-right data-align=right style="border:1px solid #696969">3,689<td class=has-text-align-center data-align=center style="border:1px solid #696969">1/2</tr>
</table></figure>

<h5 class="wp-block-heading has-text-align-center"><mark style=background-color:rgba(0,0,0,0) class="has-inline-color has-black-color"><strong>末尾別結果</strong></mark></h5>
<figure class=wp-block-table><table><tbody><tr><th class=has-text-align-center data-align=center style="border-left:1px solid #000080;border-top:1px solid #000080">末尾番号<th class=has-text-align-center data-align=center style="border-top:1px solid #000080">平均差枚<th class=has-text-align-center data-align=center style="border-top:1px solid #000080">平均G数<th class=has-text-align-center data-align=center style="border-right:1px solid #000080;border-top:1px solid #000080">勝率<tr><td><a href="...">末尾0</a><td class=has-text-align-right data-align=right><strong><font color=red>-56</font></strong><td class=has-text-align-right data-align=right>4,007<td class=has-text-align-center data-align=center>28/72</tr>
<tr><td><a href="...">末尾ゾロ目</a><td class=has-text-align-right data-align=right><strong><font color=red>-154</font></strong><td class=has-text-align-right data-align=right>3,924<td class=has-text-align-center data-align=center>29/70</tr>
</table></figure>
</body>
</html>`;

console.log("Snippet defined");
