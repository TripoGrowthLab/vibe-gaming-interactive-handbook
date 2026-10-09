# Tripo Studio steps

For stage 4 of the [Vibe Gaming Prompt](vibe-gaming.md). Your coding agent gives you a table with one row per entry: id, kind, hero or not, image prompt, polygon budget, file name, animations or parts, and styles or a texture prompt. Make every row in [Tripo Studio](https://studio.tripo3d.ai) with the steps below, then put the files in `public/assets/` and tell your agent they are in.

Studio changes often. If a button is not where these steps say, look for it nearby, and tell your agent what you did differently.

## Before you start

- **Plan.** Generate in Parts, Private models and 8K textures are members-only settings. On the free plan your models are public and not for commercial use, and entries of kind parts cannot be made.
- **Privacy.** Before every Generate, set Privacy to Private. On the Smart Mesh tab it starts as Sharing Only; elsewhere it keeps your last choice.
- **Credits, roughly.** A Smart Mesh P2.0 model with its texture about 110, a hero about 120 before styles, Retopo 35, Auto Rig 20, Text to Motion 20, each style 25. Props add up: in one build six props were two thirds of the total.
- **Settings that stick.** Texture Resolution, Generate in Parts, Remove Lighting, export resolution and Pack UV all keep your last choice, even across models, and Texture Resolution can go back to 8K after a reload. Check them every time.

## 1. Make the image

In Studio, open **Image**, paste the row's prompt and generate. Pick the image whose shape best matches the row: right proportions, a clean white background, and for a person a clean T-pose with space between the arms, legs and body. For a hero, generate a few and pick the one with the clearest details. If a picture shows the character twice (front and back), do not use it; generate again.

## 2. Make the model

Hover over the image you picked and click **Generate 3D**. What you choose depends on the row's kind.

**Prop or person (not hero).** Generate 3D may open on the HD Model tab, so click the **Smart Mesh** tab and choose P2.0 (P1.0 if P2.0 is not on your plan). Open Topology and check it says Triangle (not Quad) and Polycount = the budget. Check this every time: it resets even though it says it saves your settings. Number of Generation 1. Generate. For a soft, rounded person such as clay or plush, the HD Model tab with H3.1 can look better; everything else stays the same.

**Parts (not hero).** Do not use Smart Mesh. On the **HD Model** tab, pick H3.1, turn on Generate in Parts, choose Simple, open Geometry & Texture and set Topology to Triangle and Polycount = the budget (it will not go below 10000). Generate. You get several pieces named `tripo_part_N`, not always one per part on the list. If two parts on the list came out as one piece, tell your agent which ones. Open **Segment** in the left bar, then **Fill Parts**, choose AI Completion and click Part Completion to fill the gaps; the result saves by itself.

**Hero.** On the **HD Model** tab, pick H3.1, open Geometry & Texture, turn on Ultra Mesh Quality, set Topology to Triangle and Polycount to 200000.

- *Person:* make sure Generate in Parts is off, turn on Texture with Texture Quality 4K and PBR, and make sure Remove Lighting is off. Generate.
- *Parts:* turn on Generate in Parts with Simple. Generate, then fill the gaps as above (Segment, Fill Parts, Part Completion). Open Texture at 4K and Generate Texture, then open **PBR** in the left bar and Generate PBR.

Then reduce it to the budget: open **Retopo**, choose Triangle, keep Smart Mesh on, set Polygon Count to the budget and start it. Retopo changes this same model and keeps its textures, PBR maps and pieces. If you also want the full version, export it before Retopo; to get back to it later, open History and restore that version (the back-arrow icon).

## 3. Texture

Skip this for a hero: it already has its textures.

Open **Texture**, make sure Texture Resolution is 2K and Remove Lighting is off (so every model is shaded the same way), and Generate Texture. If your agent asks for 1K, still generate at 2K and choose 1k when you export.

## 4. Rig and animate (people only)

For a hero person, do this only after Retopo: Auto Rig refuses a model above about 100000 triangles.

Open **Rig**, choose Humanoid and the Mixamo skeleton, click Auto Rig. Then open **Animate** (under Rig in the left bar), make sure All is selected, search each animation name from the row and click it to apply. Wait until it finishes Retargeting before you click the next one; the first one can take a couple of minutes. For an animation written as a description, paste it into Text to Motion and generate (this one costs credits). It appears under the AI Animation tab with a new title; after a new texture, apply it again from there (no credits).

## 5. Export

Click **Export**: GLB, texture resolution as in the row (2K unless it says otherwise; 4K for a hero), file name = the id. A hero can take a minute or more to download.

- *Person:* make sure Export Skeleton is on, click Number of Animations and choose Select All (it starts at 0, which exports no animations), and make sure Animation stay in Place is on.
- *Pack UV:* if you see it, turn it on for a hero with parts (it packs every piece into one set of textures) and keep it off for everything else.

## 6. Styles and colour versions

Do this after exporting the default version.

**A style** (classic, Wood, another style Studio lists, or your own image): open Texture, pick it under Create Your Own Texture Style, check the resolution, Generate Texture again, and export it as the id plus the style name (for example `robot_wood`). For your own image, make the picture in Image from the row's line first, download it, and upload it under Create Your Own Texture Style.

**A colour version** (a texture prompt in the row): open Texture, choose no style, open the pencil tab at the top, paste the texture prompt and Generate Texture. Export it under the file name in the row.

**Going back to no style:** click the chosen style again in the style window. An uploaded style stays selected that way: pick a built-in style, then click it again.

**Heroes:** a style comes without the metal-rough map, so open **PBR** and Generate PBR again before you export it (5 credits). Each style file can come with its own UVs, especially with Pack UV on; that is expected, and your agent will use the whole file for that skin.

**People:** a new texture removes the animations. Apply them again in Animate (this costs no credits) before you export.

## 7. Put the files in place

Put every file in `public/assets/` (create the folder if it is not there), replacing any old file with the same name. If your browser saved a file as a new name such as `hero (1).glb`, take the newest one and rename it to the id. Then tell your agent they are in.
