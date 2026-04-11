# Pasuta

Pasutaは、コードのタブを展開したテキストや画像としてコピーするVS Code拡張機能です。  
行番号の有無を選択可能でシンタックスハイライト付きでのコピーを素早く行えます。

## コマンド

`Pasuta: Copy Text`  
テキストとしてコピーします。

`Pasuta: Copy Text with Colon Lines`  
`行番号: コード`形式でテキストとしてコピーします。

`Pasuta: Copy Text with Tab Lines`  
`行番号<TAB>コード`形式でテキストとしてコピーします。

`Pasuta: Copy Image`  
画像としてコピーします。

`Pasuta: Copy Image with Colon Lines`  
`行番号: コード`形式で画像としてコピーします。

## 特徴
- 選択範囲を行選択されているものとしてコピーします。
- 複数選択にも対応し、上から順に連結してコピーします。
- コピー前にタブ幅を入力し、タブをスペースに展開します。
- コピー時は、現在のテーマ(light/dark)に合わせたシンタックスハイライトを反映します。
- テキストコピー時は、WindowsとmacOSではリッチテキストも同時にクリップボードにコピーします。

## 開発用

### PowerShell

```powershell
npm.cmd install
npm.cmd run compile
npm.cmd run package
```

### Command Prompt

```cmd
npm install
npm run compile
npm run package
```

## その他

- この拡張機能の作成にはCodexを利用しています。

## ライセンス

MIT License
