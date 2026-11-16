# WeserAds Neon Tide

A dark VS Code color theme based on the WeserAds brand palette: deep navy, Weser teal, mint, and orange. The vivid accents add a retro-neon feel while keeping the theme distinct from Synthwave '84.

## Activate

After installing the extension, open **Preferences: Color Theme** and select **WeserAds Neon Tide**.

## Optional editor background

VS Code color themes cannot set image backgrounds by themselves. To use the included `images/weserads-background.png` behind editor text, install the third-party [`background` extension](https://marketplace.visualstudio.com/items?itemName=shalldie.background), then add this to your **User** `settings.json`:

```json
{
  "background.enabled": true,
  "background.editor": {
    "useFront": false,
    "style": {
      "background-position": "center center",
      "background-size": "cover",
      "opacity": 0.25
    },
    "images": [
      "file:///ABSOLUTE/PATH/TO/weserads-background.png"
    ],
    "interval": 0,
    "random": false
  }
}
```

Replace the example image URL with the absolute `file:///` URL to the included image, either in this repository or in the installed theme extension folder.

The background extension modifies VS Code's internal workbench files. It is not an official theme API, may trigger a corruption warning, and may need to be reapplied after VS Code updates. Use it at your own discretion.

## Palette

- Background: `#081522` / `#0A1931`
- Teal: `#0EA5A0`
- Mint: `#99F6E4`
- Orange: `#FF6B2C`
- Text: `#DCE7F2`
