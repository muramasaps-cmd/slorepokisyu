# 🎰 スロット店舗 粗利・売上分析システム (Slorepo Profit Analyzer)

スロレポの店舗出玉ページ（HTMLデータ）を取り込み、ホールの粗利推移・客収支・出玉率（機械割）・特日/曜日/末尾別傾向を詳細に可視化・分析できるWebアプリケーションです。

React 19 + TypeScript + Tailwind CSS + Recharts で構築されており、美しく直感的なダッシュボードで店舗の真の経営状況（実務ホールコン方式・換金ギャップモデル連動）を分析できます。

---

## 🌟 主な機能

1. **スロレポHTMLファイルの直接ドラッグ＆ドロップ・一括インポート**
   - 複数ファイル・複数月分の一括投入、差分マージに対応
   - 店舗名・貸出枚数・交換枚数（換金率）・特日ルール・総台数を自動解析
2. **ダッシュボード & 月別推移グラフ**
   - **TOP画面**: 主要KPIカード（期間累計粗利、月平均粗利、最高黒字月、最大還元月）と月別粗利＆累計推移グラフを一望
   - 単月バーグラフ・累計推移折れ線・稼働ゲーム数推移の切り替え
3. **実務ホールコン方式（G数・IN枚数連動モデル）**
   - 差枚数だけでなく、客側の現金投資比率と換金ギャップ手数料（貸出レートと交換レートの差）を加味した高精度な店舗粗利計算
4. **多彩な分析機能**
   - 🎯 **旧特日・イベント日サイクル分析**（特日と通常日の利益・出玉比較）
   - 📆 **曜日・祝日別傾向分析**（各曜日の平均粗利・勝率・差枚分布）
   - 🔢 **〇のつく日別（末尾0〜9 & ゾロ目）傾向分析**
   - 📋 **全営業日（カレンダー・詳細リスト）閲覧**
5. **マルチ店舗管理 & ローカル保存**
   - 複数店舗のデータをブラウザのLocalStorageに安全に保持・ワンクリック切り替え

---

## 🚀 GitHubからのセットアップ・実行方法

### 必要な環境
- Node.js (v18.0.0 以上推奨)
- npm または bun / yarn / pnpm

### 1. リポジトリのクローン
```bash
git clone https://github.com/<YOUR_USERNAME>/<REPOSITORY_NAME>.git
cd <REPOSITORY_NAME>
```

### 2. 依存パッケージのインストール
```bash
npm install
```

### 3. 開発サーバーの起動
```bash
npm run dev
```
起動後、ブラウザで `http://localhost:3000` を開くとすぐにアプリケーションが利用可能です。

### 4. プロダクションビルド
```bash
npm run build
```
`dist/` フォルダに静的ファイルが生成されます。GitHub Pages、Vercel、Netlify、Cloudflare Pages など、お好みの静的ホスティングサービスに即座にデプロイ可能です。

---

## 🌐 GitHub Pages への公開手順（推奨）

このWebアプリはサーバーを必要としない完全なクライアントサイドSPA（Single Page Application）のため、GitHub Pagesに完全無料で公開できます。

1. **リポジトリの「Settings」タブ** を開く
2. 左メニューの **「Pages」** を選択
3. **Build and deployment** の Source で **「GitHub Actions」** を選択
4. Vite用の静的デプロイワークフローを設定するか、`npm run build` で生成した `dist` を公開ブランチに指定することで、世界中からブラウザだけでアクセス可能になります。

---

## 📁 プロジェクト構成

```text
├── index.html                  # エントリーHTML
├── package.json                # パッケージ依存・ビルドスクリプト
├── vite.config.ts              # Vite設定
├── src/
│   ├── App.tsx                 # メインアプリケーション
│   ├── components/             # UIコンポーネント群
│   │   ├── Header.tsx          # 店舗情報・ヘッダー
│   │   ├── KpiCards.tsx        # TOP左側 4大KPIカード
│   │   ├── ProfitChart.tsx     # TOP右側 月別推移グラフ (Recharts)
│   │   ├── TailNumberAnalysis.tsx # 末尾日別分析
│   │   ├── DayOfWeekAnalysis.tsx  # 曜日別分析
│   │   ├── MonthlyTable.tsx    # 月別詳細集計表
│   │   ├── SpecialDayPatterns.tsx # 特日サイクル分析
│   │   ├── DailyModal.tsx      # 日別詳細モーダル
│   │   └── StoreManagerModal.tsx  # HTMLインポート・店舗管理
│   ├── utils/
│   │   ├── dataEngine.ts       # G数連動・粗利計算エンジン
│   │   ├── htmlParser.ts       # スロレポHTML構文解析
│   │   ├── multiHtmlParser.ts  # 複数ファイルマージ処理
│   │   └── storeStorage.ts     # LocalStorage店舗データ管理
│   └── data/
│       └── types.ts            # TypeScript型定義
```

---

## 📄 ライセンス
MIT License
