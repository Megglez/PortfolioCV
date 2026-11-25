# Megan Lai CV

Personal CV website for Megan Lai, a final-year Computer Science & Data Science student at the University of Pretoria. It uses a dark "console" design with Full CV and Timeline tabs, an architecture walkthrough and fire-spread sandbox for FireAway, and a nursery simulation with a design-pattern explorer for Chaotic Plants.

## Stack

Plain HTML, CSS and JavaScript ES modules. There is no build step and there are no dependencies. Fonts are loaded from Google Fonts.

## Project structure

```
index.html              Page markup
css/styles.css          All styles
js/main.js              Entry point
js/fire-sim.js          FireAway fire-spread sandbox
js/architecture.js      FireAway architecture walkthrough
js/nursery.js           Chaotic Plants nursery simulation
js/timeline.js          Timeline tab
Megan_Lai_CV_v2.1.pdf   Downloadable CV
```

## Run locally

ES modules do not load from `file://`, so serve the folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

Any static host works. For GitHub Pages, publish from the repository root on the `main` branch.
