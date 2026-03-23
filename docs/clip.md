<!DOCTYPE html>

<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>TACTICAL_CMD_v4.0.2 | CLIP_MGMT</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&amp;family=Inter:wght@400;600;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            colors: {
              "error-container": "#7e2b17",
              "tertiary": "#ff766c",
              "on-primary": "#354518",
              "on-tertiary-fixed-variant": "#470003",
              "surface-container": "#161a1a",
              "on-tertiary-fixed": "#000000",
              "on-error": "#450900",
              "tertiary-fixed-dim": "#ed4e46",
              "on-tertiary-container": "#310002",
              "secondary-fixed": "#ffdf9d",
              "on-primary-container": "#c3d89b",
              "primary": "#b9ce92",
              "primary-fixed": "#d5ebac",
              "secondary-fixed-dim": "#facf6e",
              "on-secondary-fixed-variant": "#755700",
              "on-secondary-container": "#e4ba5b",
              "tertiary-container": "#ff5a52",
              "outline": "#707777",
              "on-primary-fixed": "#344517",
              "secondary-dim": "#bf983e",
              "on-background": "#e1e7e6",
              "inverse-on-surface": "#545555",
              "outline-variant": "#434949",
              "inverse-primary": "#536534",
              "surface-container-highest": "#212727",
              "error-dim": "#ba573f",
              "surface-container-low": "#111414",
              "primary-dim": "#acc086",
              "tertiary-fixed": "#ff5a52",
              "secondary-container": "#4d3800",
              "on-surface-variant": "#a6acac",
              "on-secondary-fixed": "#523c00",
              "on-tertiary": "#4f0004",
              "primary-fixed-dim": "#c7dc9f",
              "surface-container-lowest": "#000000",
              "surface-container-high": "#1c2021",
              "surface-dim": "#0d0f0f",
              "on-primary-fixed-variant": "#506130",
              "on-surface": "#e1e7e6",
              "error": "#ed7f64",
              "surface-variant": "#212727",
              "surface-tint": "#b9ce92",
              "on-secondary": "#2b1e00",
              "on-error-container": "#ff9b82",
              "secondary": "#bf983e",
              "tertiary-dim": "#ff7167",
              "surface": "#0d0f0f",
              "inverse-surface": "#f9f9f9",
              "primary-container": "#3b4c1e",
              "surface-bright": "#262d2e",
              "background": "#0d0f0f"
            },
            fontFamily: {
              "headline": ["Space Grotesk"],
              "body": ["Inter"],
              "label": ["Inter"]
            },
            borderRadius: {"DEFAULT": "0px", "lg": "0px", "xl": "0px", "full": "9999px"},
          },
        },
      }
    </script>
<style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            font-size: 18px;
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0d0f0f; }
        ::-webkit-scrollbar-thumb { background: #434949; }
        ::-webkit-scrollbar-thumb:hover { background: #b9ce92; }
        body { -webkit-font-smoothing: antialiased; }
    </style>
</head>
<body class="bg-background text-on-background font-body h-screen overflow-hidden flex flex-col">
<!-- TopAppBar -->
<header class="bg-[#0d0f0f] dark:bg-[#0d0f0f] flex justify-between items-center w-full px-2 h-10 overflow-hidden border-b border-surface-container-high z-50">
<div class="flex items-center gap-4">
<span class="text-sm font-black text-[#b9ce92] tracking-widest">TACTICAL_CMD_v4.0.2</span>
<div class="h-4 w-[1px] bg-outline-variant"></div>
<nav class="flex gap-4">
<span class="font-['Space_Grotesk'] uppercase tracking-tighter text-xs font-bold text-[#b9ce92]">Archive</span>
<span class="font-['Space_Grotesk'] uppercase tracking-tighter text-xs font-bold text-[#4b5320]">Monitoring</span>
<span class="font-['Space_Grotesk'] uppercase tracking-tighter text-xs font-bold text-[#4b5320]">Intelligence</span>
</nav>
</div>
<div class="flex items-center gap-2">
<div class="bg-surface-container-high px-2 py-0.5 flex items-center gap-2">
<span class="material-symbols-outlined text-primary" style="font-size: 14px;">search</span>
<input class="bg-transparent border-none text-[10px] uppercase font-bold focus:ring-0 w-32 placeholder:text-outline" placeholder="GLOBAL_SEARCH..." type="text"/>
</div>
<div class="flex gap-1">
<button class="p-1 text-[#b9ce92] hover:bg-[#1c2021] transition-colors duration-100"><span class="material-symbols-outlined">timer</span></button>
<button class="p-1 text-[#b9ce92] hover:bg-[#1c2021] transition-colors duration-100"><span class="material-symbols-outlined">dns</span></button>
<button class="p-1 text-[#b9ce92] hover:bg-[#1c2021] transition-colors duration-100"><span class="material-symbols-outlined">notifications_active</span></button>
</div>
</div>
</header>
<main class="flex flex-1 overflow-hidden">
<!-- SideNavBar -->
<aside class="bg-[#111414] dark:bg-[#111414] fixed left-0 top-10 h-[calc(100vh-2.5rem)] flex flex-col justify-between items-center py-0 w-16 z-40">
<div class="flex flex-col w-full">
<div class="flex flex-col items-center py-4 gap-6">
<div class="flex flex-col items-center gap-1 group cursor-pointer text-[#4b5320]">
<span class="material-symbols-outlined">videocam</span>
<span class="font-['Inter'] text-[10px] font-bold uppercase tracking-widest">Surv</span>
</div>
<div class="flex flex-col items-center gap-1 group cursor-pointer bg-[#1c2021] text-[#b9ce92] border-l-2 border-[#b9ce92] w-full py-2">
<span class="material-symbols-outlined">history</span>
<span class="font-['Inter'] text-[10px] font-bold uppercase tracking-widest">Arch</span>
</div>
<div class="flex flex-col items-center gap-1 group cursor-pointer text-[#4b5320]">
<span class="material-symbols-outlined">settings</span>
<span class="font-['Inter'] text-[10px] font-bold uppercase tracking-widest">Conf</span>
</div>
</div>
</div>
<div class="flex flex-col items-center w-full pb-4 gap-6">
<div class="flex flex-col items-center gap-1 cursor-pointer text-[#4b5320] hover:text-[#b9ce92]">
<span class="material-symbols-outlined">terminal</span>
</div>
<div class="flex flex-col items-center gap-1 cursor-pointer text-[#4b5320] hover:text-[#ff766c]">
<span class="material-symbols-outlined">logout</span>
</div>
</div>
</aside>
<!-- Main Content Canvas -->
<div class="ml-16 flex w-full overflow-hidden">
<!-- Left Panel: Filters -->
<section class="w-48 bg-surface-container-low flex flex-col border-r border-outline-variant">
<div class="p-2 border-b border-outline-variant bg-surface-container">
<span class="font-headline text-[10px] font-bold tracking-widest text-primary uppercase">Filters</span>
</div>
<div class="p-2 flex flex-col gap-4 overflow-y-auto">
<!-- Time Filter -->
<div class="space-y-1">
<label class="font-label text-[9px] font-bold text-on-surface-variant uppercase">Temporal_Range</label>
<select class="w-full bg-surface-container-highest border-none text-[10px] font-bold p-1 text-on-surface focus:ring-1 focus:ring-primary">
<option>LAST_24_HOURS</option>
<option>LAST_7_DAYS</option>
<option>SPECIFIC_NODE</option>
</select>
</div>
<!-- Node Filter -->
<div class="space-y-1">
<label class="font-label text-[9px] font-bold text-on-surface-variant uppercase">Node_ID</label>
<div class="grid grid-cols-2 gap-1">
<button class="bg-primary text-on-primary text-[9px] font-bold py-1">ALPHA</button>
<button class="bg-surface-container-high text-on-surface-variant text-[9px] font-bold py-1">BRAVO</button>
<button class="bg-surface-container-high text-on-surface-variant text-[9px] font-bold py-1">CHARLIE</button>
<button class="bg-surface-container-high text-on-surface-variant text-[9px] font-bold py-1">DELTA</button>
</div>
</div>
<!-- Class Filter -->
<div class="space-y-1">
<label class="font-label text-[9px] font-bold text-on-surface-variant uppercase">Classification</label>
<div class="space-y-1">
<div class="flex items-center gap-2 bg-surface-container-highest p-1">
<input checked="" class="w-3 h-3 rounded-none bg-background border-outline-variant text-primary focus:ring-0" type="checkbox"/>
<span class="text-[9px] font-medium">VEHICLE</span>
</div>
<div class="flex items-center gap-2 bg-surface-container-highest p-1">
<input checked="" class="w-3 h-3 rounded-none bg-background border-outline-variant text-primary focus:ring-0" type="checkbox"/>
<span class="text-[9px] font-medium">PERSON</span>
</div>
<div class="flex items-center gap-2 bg-surface-container-highest p-1">
<input class="w-3 h-3 rounded-none bg-background border-outline-variant text-primary focus:ring-0" type="checkbox"/>
<span class="text-[9px] font-medium">WEAPON</span>
</div>
</div>
</div>
<!-- Priority Filter -->
<div class="space-y-1">
<label class="font-label text-[9px] font-bold text-on-surface-variant uppercase">Priority_Level</label>
<div class="flex flex-col gap-1">
<div class="h-1 bg-error w-full"></div>
<div class="h-1 bg-secondary w-full opacity-30"></div>
<div class="h-1 bg-primary w-full opacity-30"></div>
</div>
</div>
</div>
</section>
<!-- Center Panel: Dense Event Table -->
<section class="flex-1 bg-surface flex flex-col overflow-hidden">
<div class="p-2 border-b border-outline-variant bg-surface-container flex justify-between items-center">
<span class="font-headline text-[10px] font-bold tracking-widest text-primary uppercase">Event_Log_Stream</span>
<span class="font-headline text-[10px] font-bold text-on-surface-variant">TOTAL_COUNT: 4,029</span>
</div>
<div class="flex-1 overflow-auto">
<table class="w-full text-left border-collapse">
<thead class="sticky top-0 bg-surface-container-low text-[9px] uppercase font-black text-on-surface-variant tracking-tighter">
<tr>
<th class="p-1 border-b border-outline-variant">Timestamp</th>
<th class="p-1 border-b border-outline-variant">Node</th>
<th class="p-1 border-b border-outline-variant">Class</th>
<th class="p-1 border-b border-outline-variant text-right">Conf%</th>
<th class="p-1 border-b border-outline-variant text-center">Status</th>
</tr>
</thead>
<tbody class="text-[10px] font-medium">
<!-- Row 1 (Active) -->
<tr class="bg-surface-container-high border-b border-outline-variant/30 text-on-surface group cursor-pointer">
<td class="p-1 font-headline font-bold text-primary">14:22:01:002</td>
<td class="p-1 font-bold">NODE_09_A</td>
<td class="p-1"><span class="bg-secondary-container text-on-secondary-container px-1 py-0 font-bold">VEHICLE</span></td>
<td class="p-1 text-right font-headline">98.4</td>
<td class="p-1 text-center"><span class="material-symbols-outlined text-[12px] text-secondary">pending</span></td>
</tr>
<!-- Repeat Rows -->
<tr class="border-b border-outline-variant/10 hover:bg-surface-container-high/50 text-on-surface-variant group cursor-pointer transition-colors">
<td class="p-1 font-headline">14:21:58:882</td>
<td class="p-1">NODE_04_C</td>
<td class="p-1"><span class="bg-surface-container-highest text-on-surface-variant px-1 py-0 font-bold">PERSON</span></td>
<td class="p-1 text-right font-headline">72.1</td>
<td class="p-1 text-center"><span class="material-symbols-outlined text-[12px] text-primary">check_circle</span></td>
</tr>
<!-- Row Alert -->
<tr class="border-b border-outline-variant/10 bg-error-container/20 hover:bg-error-container/40 text-on-surface group cursor-pointer">
<td class="p-1 font-headline font-bold text-error">14:21:45:110</td>
<td class="p-1 font-bold">NODE_12_D</td>
<td class="p-1"><span class="bg-error text-on-error px-1 py-0 font-bold">WEAPON</span></td>
<td class="p-1 text-right font-headline">99.9</td>
<td class="p-1 text-center"><span class="material-symbols-outlined text-[12px] text-error">priority_high</span></td>
</tr>
<!-- Multiple Filler Rows -->
<script>
                                for(let i=0; i<25; i++){
                                    document.write(`
                                        <tr class="border-b border-outline-variant/10 hover:bg-surface-container-high/50 text-on-surface-variant group cursor-pointer">
                                            <td class="p-1 font-headline">14:20:${(50-i).toString().padStart(2, '0')}:441</td>
                                            <td class="p-1">NODE_0${Math.floor(Math.random()*9)}_B</td>
                                            <td class="p-1"><span class="bg-surface-container-highest text-on-surface-variant px-1 py-0 font-bold">${['PERSON','VEHICLE','OBJECT'][Math.floor(Math.random()*3)]}</span></td>
                                            <td class="p-1 text-right font-headline">${(Math.random()*30 + 60).toFixed(1)}</td>
                                            <td class="p-1 text-center"><span class="material-symbols-outlined text-[12px] text-primary">check_circle</span></td>
                                        </tr>
                                    `);
                                }
                            </script>
</tbody>
</table>
</div>
</section>
<!-- Right Panel: Review & Player -->
<section class="w-[420px] bg-surface-container flex flex-col border-l border-outline-variant">
<!-- Video Player Area -->
<div class="relative aspect-video bg-black flex flex-col group">
<div class="absolute inset-0 flex items-center justify-center opacity-30 group-hover:opacity-100 transition-opacity">
<span class="material-symbols-outlined text-4xl text-primary">play_arrow</span>
</div>
<img class="w-full h-full object-cover opacity-60" data-alt="Security camera footage showing parking lot at night" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCc25snxnxCAjtRQ7XO9xlMmge_dfu5diQscYAwvZGeZretbFexdNkdM8r2KN2ear5AB3eDC6V63UEBUIcW6ojN-hhiF6eK8bbAEU9SDwIz8opanfjr2jueBlcxQAv4pW-ooRy7XcOLx1QnUNsofG_cA5IF894G34d5bVFwXVbn6aAn84iKS6C81Vvx37jjSPjN0wULW7c3EW6Zva6mQkhZN6_WTmfLRuu1eveyWevMDArwKQJjqCRt6V3Myr9XVowMPDs52CF9bxV8"/>
<div class="absolute top-0 left-0 bg-surface-container-highest px-2 py-0.5 text-[9px] font-bold text-primary tracking-widest">LIVE_FEED_09_A</div>
<div class="absolute bottom-0 left-0 w-full bg-black/80 px-2 py-1 flex items-center gap-2">
<div class="flex-1 h-0.5 bg-outline-variant relative">
<div class="absolute top-0 left-0 w-3/4 h-full bg-primary"></div>
<div class="absolute -top-1 left-3/4 w-1 h-2.5 bg-on-background"></div>
</div>
<span class="text-[9px] font-headline text-on-surface-variant">00:12:44</span>
</div>
</div>
<!-- Keyframe Strip -->
<div class="h-10 bg-surface-container-lowest border-b border-outline-variant flex overflow-x-hidden">
<div class="flex-none w-12 border-r border-outline-variant overflow-hidden"><img class="w-full h-full object-cover grayscale opacity-50" data-alt="Keyframe 1" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPxCcFVecHoz75Vgx6sKk4pTfSkhN7PJfV-3gAeqvPk0vvkQikWL1eIw4UuYvtphFmiJwEVtFrtRIMTb53F3FWSexkJj6Si3I5VC97mB5wS81FxEMX-hBOEcTl4IuAIX5inHm_ZDOUg5feBapu_cVGHUs68fRgL3xLAP8aCf-vmUXmCQYFnN-GsO7OubtIaZA1W8bEA_cIliOSgyaQYW3Z9YAmdEjBCx_G8zF8Klu9WN-yrekBQ_YRQTTCRwDlhdSQbYr9SFWuxkey"/></div>
<div class="flex-none w-12 border-r border-outline-variant overflow-hidden border-b-2 border-primary"><img class="w-full h-full object-cover" data-alt="Keyframe 2" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOpzrEAoHDe5HQJoqwgV5OsnGdCZdSYGan0NlpNTl9wVWs4MSG4mEBP1S-9wQ3cck6j7sBWPHyqxM9KhEVuT7dGR2z6ErgGZTmh5MZrW9CeP-Zn4C9Doysrz7h4_724e59qN1_LDgWCeAdc0sQcKEjqe2n39sHitWsxmbGNObk6f0zkAR_4WVu-YTsoxyU2-DjPd4tPG57opBybFXGhguuOV3Jtmoekm5ou_JS7NuzPPc0npp7KZvbgD7ZHJLzo_J_DnP_MW67DlJN"/></div>
<div class="flex-none w-12 border-r border-outline-variant overflow-hidden"><img class="w-full h-full object-cover grayscale opacity-50" data-alt="Keyframe 3" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAvOdLqBWZNIqLrM8WH1GrQtnF1KVOAfMxuvGqjLxPPczcaOKotXZVuZX5eH8EZmPMC9_jr0EqVWXJRTesdoaqZ153pJ6oqGuY533rqwcZmBgdTnqJgkdQzTYiRS-6VQi_TkYXq4eV5IiicFgUMPareaCWoijUNh3uZfkf01RP6YP-PK6IqWwySP4owZMdDP1wweJ9INiX1S4P2ru6L-S7-_o5kJ2xLRYenexwc5HG8yM3dTlB2SQls069vVayDIE_XL5Y6luvm2Wd9"/></div>
<div class="flex-none w-12 border-r border-outline-variant overflow-hidden"><img class="w-full h-full object-cover grayscale opacity-50" data-alt="Keyframe 4" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCWbgUohIk8xGIoAzG6WcbPHKxWlDA9U8C5GlJ_QIdc-d3vXsjlXX_Hw8MsK67EZDbTRBiNcNSoeqv6I9X1n_6abam-ZUjCpoX1zR4ckUFpxVn-5lUI1h2nuOEPBAIrJbHUm-T2doSdY-W-n6tea5sdbHi9cAiTPvTEuqrW3KiVuHvnEWwKKIi0VDmH0Yx9IVplzHw-z1n039L8hj6RjaA2FkLX5GF3DirkEI4U6FwcFuVvR96Oz6wNqjduzXJNh6GEyLpL449UxonA"/></div>
<div class="flex-none w-12 border-r border-outline-variant overflow-hidden"><img class="w-full h-full object-cover grayscale opacity-50" data-alt="Keyframe 5" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDiK7W3MfRwl4B1_-tB6pG-0sqFUnsjVDp_8EXw2nH1cwOtbmuMZOGFTkQLRFh1aJBwIL3XyI1II7KWhPQwdhi_--92dnNAO_d5LEFRaqa6nKs0tMpiGdwbbhhETB6bliMqA9CAuQCiO9YfaWFKNtl79vj8QQunvYwgIzIcTwHfCyLf8c-4y8IM3pWVeqmkJfOnnSpQGz6QlshCQzabTwUFFByBJVCQH5hVz38Yn8GxT7faB0dymJdmloasMfxFGbIoBIenoTspDnUt"/></div>
<div class="flex-none w-12 border-r border-outline-variant overflow-hidden"><img class="w-full h-full object-cover grayscale opacity-50" data-alt="Keyframe 6" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDhHUIdYbnov6f7Ii6IzsK59ZJyygqJGhetMZPjWjfM4hcVrVrP_JCB9ZE4_cCarzDwqqifn7LrN_KLBsxJzrrJcvHorj6A3MCeDaI4DlHjlUpyL926Xn8NA7jLG-R19x4eigNYv_izqnJ1IdHXaWxtTDPRiL2G20XSCKzA7Xa-36PgxcikZh99b_oSxBxXIGOuhy3dO4aTgm7Tg3LQQTBhISfgetjlHC7Js9O0DwUyL0UiDKRDeW7fFEQl-NLVhzW8jMZ0S4H7Z71o"/></div>
<div class="flex-none w-12 border-r border-outline-variant overflow-hidden"><img class="w-full h-full object-cover grayscale opacity-50" data-alt="Keyframe 7" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAGKgwwNoSfgAubEkxi3LD1sOicy9u_i7Pmrssd1tSO9GVksTXO7c28fJudOhsBGhDPn1wA6m5u_jdo_2G5VtJe-jz-37Gg8yLRrTbxLAOHx27AAQWdYTXSbxERr6EsRbx7R3dlGo3UGOXV4l_I2lU2prEo7YE0CkDeE5xolf72U504WZrHfqUym-VqNvbG6_0q21sEmm3tM_7woFaTgU5-HOeVaB8BeY2MXSVs6igLG5QkG82fAimeqM9sHXNw00XxMlIbEcIUTEn2"/></div>
<div class="flex-none w-12 border-r border-outline-variant overflow-hidden"><img class="w-full h-full object-cover grayscale opacity-50" data-alt="Keyframe 8" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCI1TFQk0Nrs5Ba96WvkrNES5ro7j0I3JSAH9NqWOh8hLglXmMWYl11SoRbEGg07uWaI9fO4lDYYTl_6iQz0jK_p8EUgdlZDz0lyADvT5exppF28enITob51SKK0kR3Z7MHOGXf0BxnJfOcWhXzQHpA2gB1n7-x9iEdVnqZ3v4WJLpmXEWlbBFI7e7D-OjOJ4Hp16TfgskPukXH3pJTijiIbspH4Ja3jLgUDmB3ylXKEqkpqOL8yUm4d9znVwL-yO-Efm7z4b77x277"/></div>
</div>
<!-- Metadata Section -->
<div class="flex-1 overflow-y-auto p-2">
<div class="mb-2">
<span class="font-headline text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Primary_Metadata</span>
</div>
<div class="space-y-[1px]">
<div class="flex justify-between bg-surface-container-high p-1 text-[10px]">
<span class="text-on-surface-variant font-bold">OBJECT_ID:</span>
<span class="text-primary font-headline">P_992_V2</span>
</div>
<div class="flex justify-between bg-surface-container-high p-1 text-[10px]">
<span class="text-on-surface-variant font-bold">VELOCITY:</span>
<span class="text-on-surface font-headline">2.1 m/s</span>
</div>
<div class="flex justify-between bg-surface-container-high p-1 text-[10px]">
<span class="text-on-surface-variant font-bold">VECTOR:</span>
<span class="text-on-surface font-headline">288° NW</span>
</div>
<div class="flex justify-between bg-surface-container-high p-1 text-[10px]">
<span class="text-on-surface-variant font-bold">SIGNAL_STRENGTH:</span>
<span class="text-secondary font-headline">-82 dBm</span>
</div>
<div class="flex justify-between bg-surface-container-high p-1 text-[10px]">
<span class="text-on-surface-variant font-bold">MAC_ADDR:</span>
<span class="text-on-surface font-headline">00:1A:2B:3C:4D:5E</span>
</div>
<div class="flex justify-between bg-surface-container-high p-1 text-[10px]">
<span class="text-on-surface-variant font-bold">LATENCY:</span>
<span class="text-primary font-headline">42ms</span>
</div>
</div>
<!-- Additional Context -->
<div class="mt-4 p-2 bg-surface-container-lowest border border-outline-variant/30">
<span class="text-[9px] text-outline font-bold uppercase block mb-1">System_Notes</span>
<p class="text-[10px] text-on-surface-variant italic leading-tight">Multiple sensor triggers detected within 500ms. Node_09 correlation score high. Potential secondary movement observed in periphery.</p>
</div>
</div>
<!-- Footer Review Actions -->
<div class="p-2 bg-surface-container-highest border-t border-outline-variant flex gap-1">
<button class="flex-1 bg-primary text-on-primary py-1 px-2 text-[10px] font-black uppercase tracking-tighter hover:bg-primary-dim transition-colors">Validate</button>
<button class="flex-1 border border-outline-variant text-error py-1 px-2 text-[10px] font-black uppercase tracking-tighter hover:bg-error-container/20 transition-colors">False_Pos</button>
<button class="w-10 border border-outline-variant text-on-surface-variant py-1 px-2 text-[10px] font-black flex items-center justify-center hover:bg-surface-container transition-colors">
<span class="material-symbols-outlined" style="font-size:16px;">add_notes</span>
</button>
</div>
</section>
</div>
</main>
<!-- Global Timestamp Monolith Overlay (Bottom Right) -->
<div class="fixed bottom-2 right-2 pointer-events-none">
<div class="bg-black/80 px-4 py-1 text-on-surface-variant border-r-2 border-primary">
<span class="text-[9px] font-bold block leading-none text-primary uppercase">Current_System_Time</span>
<span class="font-headline text-2xl font-black leading-none tracking-tighter">14:22:45:<span class="text-primary">092</span></span>
</div>
</div>
</body></html>