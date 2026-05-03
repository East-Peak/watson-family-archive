export const FAMILY_CHART_THEME_CSS = `
  .f3 {
    --male-color: #161087; /* Shield */
    --female-color: #5d8400; /* Oak */
    --genderless-color: #806600; /* Trunk */
    --background-color: transparent;
    --text-color: #1f2937;
    font-family: var(--font-geist-sans), system-ui, -apple-system, sans-serif;
  }

  .f3.f3-cont {
    width: 100%;
    height: 100%;
    max-height: none;
    background-color: transparent; /* Use page vignette */
    background-image: radial-gradient(circle, rgba(22, 16, 135, 0.05) 1px, transparent 1px);
    background-size: 32px 32px;
    color: #1f2937;
  }

  /* Pointer events: pass through HTML overlay to SVG zoom */
  #htmlSvg {
    pointer-events: none !important;
  }
  #htmlSvg .cards_view {
    pointer-events: none !important;
  }
  #htmlSvg .card_cont {
    pointer-events: none !important;
  }
  #htmlSvg .card_cont .card {
    pointer-events: auto !important;
  }

  .f3 div.card {
    color: #1f2937;
  }

  /* Override library gender-colored backgrounds */
  .f3 div.card-male .card-inner,
  .f3 div.card-female .card-inner,
  .f3 div.card-genderless .card-inner,
  .f3 div.card-new-rel .card-inner,
  .f3 div.card-to-add .card-inner,
  .f3 div.card-unknown .card-inner {
    background-color: #ffffff !important;
    background: #ffffff !important;
  }

  .f3 div.card-main .card-inner,
  .f3 div.card:hover .card-inner {
    box-shadow: none !important;
  }
  .f3 div.card-main .card-inner {
    outline: none !important;
  }

  /* Opaque backgrounds to prevent line bleed-through */
  .watson-card {
    position: relative;
    z-index: 1;
  }

  /* Focused person: gold ring and deep shadow */
  .f3 div.card-main .watson-card {
    outline: 3px solid #d4a843;
    outline-offset: 2px;
    box-shadow: 0 4px 12px rgba(212, 168, 67, 0.3), 0 12px 32px rgba(22,16,135,0.2) !important;
  }

  /* Hover lift */
  .f3 div.card > div {
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .f3 div.card:hover > div {
    transform: translateY(-4px);
  }
  .f3 div.card:hover .watson-card {
    box-shadow: 0 4px 12px rgba(22,16,135,0.1), 0 16px 32px rgba(22,16,135,0.15) !important;
    border-color: #d4a843 !important; /* Gold hover border */
  }

  /* Connector lines */
  .f3 .link {
    stroke: #cbd5e1;
    stroke-width: 1.5px;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: stroke 0.3s ease, stroke-width 0.3s ease;
  }
  .f3 .link.f3-path-to-main {
    stroke: #161087;
    stroke-width: 2.5px;
    opacity: 0.85;
  }

  /* Mini-tree indicators */
  .f3 div.mini-tree {
    z-index: 2 !important;
  }
  .f3 div.mini-tree svg {
    width: 36px;
    opacity: 0.5;
    transition: opacity 0.2s ease, transform 0.2s ease;
    filter: drop-shadow(0 1px 1px rgba(0,0,0,0.06));
  }
  .f3 div.card:hover .mini-tree svg {
    opacity: 0.85;
    transform: scale(1.08);
  }
  .f3 div.mini-tree svg rect.card-male {
    fill: #a8a3d4 !important;
  }
  .f3 div.mini-tree svg rect.card-female {
    fill: #b8cc82 !important;
  }
  .f3 div.mini-tree svg line {
    stroke: #9ca3af !important;
  }

  /* Search dropdown overriding styles */
  .f3-autocomplete-cont {
    position: absolute;
    top: 24px;
    left: 24px;
    width: 300px !important;
  }
  .f3-autocomplete input {
    background-color: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(8px);
    color: #161087;
    border: 1px solid rgba(22, 16, 135, 0.2);
    border-radius: 9999px;
    font-size: 14px;
    font-family: var(--font-geist-sans), sans-serif;
    padding: 10px 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    transition: all 0.2s ease;
  }
  .f3-autocomplete input:focus {
    outline: none;
    border-color: #d4a843; /* Gold focus */
    box-shadow: 0 4px 16px rgba(212, 168, 67, 0.2);
  }
  .f3-autocomplete-items {
    background-color: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(22, 16, 135, 0.1);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    margin-top: 8px;
    overflow: hidden;
  }
  .f3-autocomplete-item > div {
    background-color: transparent;
    color: #1f2937;
    border-bottom: 1px solid rgba(22, 16, 135, 0.05);
    font-size: 13px;
    padding: 10px 16px;
    transition: background-color 0.15s ease;
  }
  .f3-autocomplete-item > div:hover,
  .f3-autocomplete-item.f3-selected > div {
    background-color: #161087;
    color: #ffffff;
  }

  /* Navigation buttons */
  .f3-nav-cont {
    z-index: 10;
    pointer-events: auto;
  }
  .f3-back-button,
  .f3-forward-button {
    color: #6b7280;
    transition: color 0.15s ease;
  }
  .f3-back-button:hover,
  .f3-forward-button:hover {
    color: #161087;
  }

  /* Search must receive pointer events */
  .f3-autocomplete-cont {
    pointer-events: auto !important;
  }

  /* Hide edit-mode elements */
  .f3 .card_add,
  .f3 .card_add_relative,
  .f3 .card_edit.pencil_icon,
  .f3-form-cont {
    display: none !important;
  }
`;
