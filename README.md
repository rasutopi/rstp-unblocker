# RSTP-Unblocker

検閲から逃れましょう（）
クライアントと外部サーバーの間に入り、検閲などから情報を守ります。

---

## 概要

シンプルなアンブロッカーです。

---

## ホスト方法

Renderや自宅サーバーなどでホストしてください。
nodejsのインストールが必須です。※nodejs24以上を推奨します。

nodejsがある環境で
```bash
npm install
```
を実行して依存関係をインストールしてください。

## サーバー起動

```bash
npm start
```

デフォルト設定：

* Host: 0.0.0.0
* Port: 3000
変えたい場合は気合でコードを書き換えてください。

アクセス例：

```
http://localhost:3000
```

---

## 必須設定

環境変数で設定してください。

| Name        | Description |
| ----------- | ----------- |
| JWT_SECRET  | JWTキー        |
| LOGIN_USER  | ログイン時のユーザー名 |
| LOGIN_PASS  | パスワード |

例：

```bash
JWT_SECRET=abcdefghijklmsopqrstuvwxyz
LOGIN_USER=username
LOGIN_PASS=1234
```

---

## メモ

* 脆弱性は修正しましたが、まだあると思います。
* 本プロジェクトは教育・検証用途向けです。
* 違法行為への使用は禁止されています。

---

## クレジット

改造はしてもよいですが、二次配布を禁じます。どうしても配布したい場合は[Rasutopi](https://scratch.mit.edu/users/rasutopi/)にご連絡ください。許可するか検討します。
