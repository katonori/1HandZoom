1HandZoom
=========
このアドオンは片手でのズーム操作を簡単にします。

下記の機能を追加します。

* エッジスワイプジェスチャー機能を追加します
    * スクリーンの右エッジを上に向かってなぞることでズームアウトします
    * スクリーンの右エッジを下に向かってなぞることでズームインします
* 設定項目
  下記パラメータをabout:configから変更することで動作を変えることができます。
    * extensions.onehandzoom.gestureSplits
        * スワイプの長さが height_of_your_device/gestureSplits を超えるとコマンドが実行されます。
        * 有効な値は 2~128 でデフォルト値は 32 になります。
    * extensions.onehandzoom.zoomStep
        * ズームコマンド１回のズーム量です。
        * 有効な値は 1~100 デフォルト値は 5 になります。