<!DOCTYPE html>

<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>TACTICAL_CMD_v4.0.2 | Surveillance Console</title>
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
        body { font-family: 'Inter', sans-serif; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d0f0f; }
        ::-webkit-scrollbar-thumb { background: #434949; }
        .scanline {
            width: 100%;
            height: 1px;
            background: rgba(185, 206, 146, 0.1);
            position: absolute;
            top: 0;
            left: 0;
        }
    </style>
</head>
<body class="bg-surface text-on-surface overflow-hidden select-none">
<!-- TopAppBar -->
<header class="bg-[#0d0f0f] dark:bg-[#0d0f0f] flex justify-between items-center w-full px-2 h-10 overflow-hidden fixed top-0 z-50">
<div class="flex items-center gap-4">
<span class="text-sm font-black text-[#b9ce92] tracking-widest font-['Space_Grotesk']">TACTICAL_CMD_v4.0.2</span>
<span class="font-['Space_Grotesk'] uppercase tracking-tighter text-xs font-bold text-[#b9ce92]">SURVEILLANCE_NODE_01</span>
</div>
<div class="flex items-center gap-2 h-full">
<div class="flex items-center gap-1 px-2 h-full hover:bg-[#1c2021] transition-colors duration-100 cursor-pointer">
<span class="material-symbols-outlined text-xs text-[#b9ce92]">timer</span>
<span class="font-['Space_Grotesk'] uppercase tracking-tighter text-[10px] font-bold text-[#b9ce92]">08:42:12_UTC</span>
</div>
<div class="flex items-center gap-1 px-2 h-full hover:bg-[#1c2021] transition-colors duration-100 cursor-pointer">
<span class="material-symbols-outlined text-xs text-[#4b5320]">dns</span>
<span class="font-['Space_Grotesk'] uppercase tracking-tighter text-[10px] font-bold text-[#4b5320]">SYS_OK</span>
</div>
<div class="flex items-center gap-1 px-2 h-full hover:bg-[#1c2021] transition-colors duration-100 cursor-pointer relative">
<span class="material-symbols-outlined text-xs text-error">notifications_active</span>
<div class="absolute top-2 right-1 w-1 h-1 bg-error animate-pulse"></div>
</div>
</div>
</header>
<!-- SideNavBar -->
<nav class="bg-[#111414] dark:bg-[#111414] fixed left-0 top-10 h-[calc(100vh-2.5rem)] flex flex-col justify-between items-center py-0 w-16 z-40">
<div class="flex flex-col w-full">
<div class="flex flex-col items-center py-4 gap-1 bg-[#1c2021] text-[#b9ce92] border-l-2 border-[#b9ce92] cursor-pointer">
<span class="material-symbols-outlined" data-icon="videocam" style="font-variation-settings: 'FILL' 1;">videocam</span>
<span class="font-['Inter'] text-[8px] font-bold uppercase tracking-widest">Surveillance</span>
</div>
<div class="flex flex-col items-center py-4 gap-1 text-[#4b5320] hover:bg-[#1c2021] transition-colors duration-0 cursor-pointer">
<span class="material-symbols-outlined" data-icon="history">history</span>
<span class="font-['Inter'] text-[8px] font-bold uppercase tracking-widest">Archive</span>
</div>
<div class="flex flex-col items-center py-4 gap-1 text-[#4b5320] hover:bg-[#1c2021] transition-colors duration-0 cursor-pointer">
<span class="material-symbols-outlined" data-icon="settings">settings</span>
<span class="font-['Inter'] text-[8px] font-bold uppercase tracking-widest">Config</span>
</div>
</div>
<div class="flex flex-col w-full">
<div class="flex flex-col items-center py-4 gap-1 text-[#4b5320] hover:bg-[#1c2021] transition-colors duration-0 cursor-pointer">
<span class="material-symbols-outlined" data-icon="terminal">terminal</span>
<span class="font-['Inter'] text-[8px] font-bold uppercase tracking-widest">LOGS</span>
</div>
<div class="flex flex-col items-center py-4 gap-1 text-[#4b5320] hover:bg-[#1c2021] transition-colors duration-0 cursor-pointer border-t border-outline-variant/10">
<span class="material-symbols-outlined" data-icon="logout">logout</span>
</div>
</div>
</nav>
<!-- Main Content Area -->
<main class="ml-16 mt-10 h-[calc(100vh-2.5rem)] flex bg-surface">
<!-- Camera Grid (3x3) -->
<section class="flex-grow grid grid-cols-3 grid-rows-3 gap-[2px] bg-outline-variant/20 p-0 relative overflow-hidden">
<!-- Grid Lines Background -->
<div class="absolute inset-0 pointer-events-none opacity-5 flex flex-col justify-between">
<div class="h-[1px] w-full bg-primary"></div>
<div class="h-[1px] w-full bg-primary"></div>
<div class="h-[1px] w-full bg-primary"></div>
<div class="h-[1px] w-full bg-primary"></div>
</div>
<!-- Cam 1 -->
<div class="relative bg-surface-container-low border-l-2 border-primary overflow-hidden">
<img alt="" class="w-full h-full object-cover opacity-60 mix-blend-luminosity" data-alt="Security camera view of dark industrial hallway" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDKq5EjARLkGQJuU4zllboCPxB6UckdMZkaQgclrLb0Uf34YYh7HxC3tm_TOPfe3Mrsk-QUlOYdGymmM7EaEOPvo7EUfSvuKtvGr636XGb_uHIvgqsD0Bfl_XFIg4bYn2yE0oBv_KTkvrzPpoWB0WwZzRizq9zlTTYteYqjXWXeHOVhdTiJqWDfBZjI5dZYYZNrUfSTemFQTmk7n8Rpgm50i_T66BO7giA9YX4113uBFeo_lSazxEkG-dyr-E5yUTHKp4P7rGtvBuJK"/>
<div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
<div class="absolute top-2 left-2 flex gap-2">
<span class="bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold font-headline text-primary">CAM_P04_NORTH</span>
<span class="bg-primary/20 text-primary px-2 py-0.5 text-[10px] font-bold font-headline">LIVE</span>
</div>
<div class="absolute top-2 right-2 text-[10px] font-headline text-on-surface-variant tracking-tighter">08:42:12.441</div>
<div class="absolute bottom-2 left-2 flex gap-1 items-center">
<div class="w-1.5 h-1.5 bg-primary animate-pulse"></div>
<span class="text-[9px] text-primary/70 font-bold tracking-widest uppercase">Signal_Optimal</span>
</div>
</div>
<!-- Cam 2 (Alarm State) -->
<div class="relative bg-surface-container-low border-l-2 border-error overflow-hidden">
<img alt="" class="w-full h-full object-cover opacity-60 mix-blend-luminosity" data-alt="CCTV view of concrete construction site with red light filter" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCnecCj8O2Y-jn6oP22X2eCRxToLXpXtzq5bRjPHHuoPtN7gLr5AXMIC7nSJHx9CNiONV6lvULZ0y5EW3DXLc-Ja6sQwFznr7xsZvhlfdnw7c3Fw5f3wVOUFEO-lyUtvSLRFL7HonvoyERsM6CP8OxJrz16AbYRwx96Aj6fTcrcOlBWpEAcgSC6Km1ptsJ_xxxfY6SKi-UH3QJ4zO_5nGuOUJH6U08qL6VQbcLRqtIs84sGJkUTBNqmFQBMGBDY2rfLwPEdgHs99lVn"/>
<div class="absolute inset-0 bg-error/10"></div>
<div class="absolute top-2 left-2 flex gap-2">
<span class="bg-error-container px-2 py-0.5 text-[10px] font-bold font-headline text-tertiary">CAM_P04_PERIMETER_B</span>
<span class="bg-error text-on-error px-2 py-0.5 text-[10px] font-bold font-headline">ALARM</span>
</div>
<div class="absolute top-2 right-2 text-[10px] font-headline text-tertiary tracking-tighter">08:42:11.002</div>
<div class="absolute inset-0 border-2 border-error/30 animate-pulse pointer-events-none"></div>
</div>
<!-- Cam 3 -->
<div class="relative bg-surface-container-low border-l-2 border-primary overflow-hidden">
<img alt="" class="w-full h-full object-cover opacity-60 mix-blend-luminosity" data-alt="Monochrome surveillance of high-rise office building exterior" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAkrPlwKwYeYdRy-7tX5RFBeN-pHuviXjXSAKcE8cTE45Xj8O8W6-yVRlgqeA5IlYt2jnIoCA86AUAbQY7JSgnSaV9kQykMCUXWkTGVqj1MoDWtF-Bde50aUhwsUErchW_QyrXVnl8XO_n2MAmUa7gdVH7HxTZEamJESsDFQ0-byrzyPMCF7S_6QEgRpkYSNQ_wQan4QSaIvvnJ6fwbWiY3uZw3Vxd6RPB5KxbWd1-1_dHQMd6bQRs9uOzKkiG4zz7tG6Gi3SbIEur8"/>
<div class="absolute top-2 left-2">
<span class="bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold font-headline text-primary">CAM_P01_ROOF_OPTIC</span>
</div>
<div class="absolute top-2 right-2 text-[10px] font-headline text-on-surface-variant tracking-tighter">08:42:12.440</div>
</div>
<!-- Cam 4 -->
<div class="relative bg-surface-container-low border-l-2 border-primary overflow-hidden">
<img alt="" class="w-full h-full object-cover opacity-60 mix-blend-luminosity" data-alt="Empty loading dock with harsh artificial lighting" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDhU2HD7_BmWri_KXbuz0GG0Z-JWNviojzlNdUt2I6hieIVFdTQlrURNFVNuystkocsl1JW4EdHWByfnoilfuA_kuEnoSZfHBB6KWxacspIqliUl8VpwLR0Vsfow5U8k0t-cAtubM1fu5l9faPf2WyzexAmAauBtN_RyhdyBxdovJ1FhI4MdIHcDHYkR_YDL5gXFP4Dl0dVya7Iw5jjGXveomk1nZmQUqK9xBsknlqsmZQ6hcMLYNJ6uGCdqkG4TJLEDoTL8TeZEFbB"/>
<div class="absolute top-2 left-2">
<span class="bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold font-headline text-primary">CAM_P09_LOADING_DOCK</span>
</div>
<div class="absolute top-2 right-2 text-[10px] font-headline text-on-surface-variant tracking-tighter">08:42:12.441</div>
</div>
<!-- Cam 5 (Central Focus) -->
<div class="relative bg-surface-container-low border-l-2 border-primary overflow-hidden">
<img alt="" class="w-full h-full object-cover opacity-80 mix-blend-luminosity scale-110" data-alt="Aerial drone view of a shipping yard at night" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzxtnWsD0u6151vkG6xoySlwWESZb1kgV_f9QujUhdL-gZI2W3KNEtdRR70I7P-U99fibx02dicWNiOlMwITL1e08S9KuCI3CzpjDwDVkbxbjXa_rzTHrv8ap64aQLBmejHmqdFAy5OepG-wTn4jgWC8hOPm65qlgqrgOQJRqIM0SGeeCKRH_aaIpARz7TSrdHdI3z1lT3168Ap9WdPqdnqop7TfISWUZoBcIJUDvGnpIcJoprsct26ZLGu1DrDAJB8Onj8on2UiAP"/>
<div class="absolute inset-0 border border-primary/20 pointer-events-none"></div>
<div class="absolute top-2 left-2 flex gap-2">
<span class="bg-primary text-on-primary px-2 py-0.5 text-[10px] font-black font-headline tracking-widest">CAM_CORE_MAIN</span>
</div>
<div class="absolute top-2 right-2 text-[12px] font-headline text-primary font-bold tracking-widest">08:42:12.441</div>
<!-- Crosshair overlay -->
<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
<div class="w-16 h-16 border border-primary/40 flex items-center justify-center">
<div class="w-1 h-1 bg-primary"></div>
</div>
</div>
</div>
<!-- Cam 6 -->
<div class="relative bg-surface-container-low border-l-2 border-primary overflow-hidden">
<img alt="" class="w-full h-full object-cover opacity-60 mix-blend-luminosity" data-alt="Surveillance view of empty dark office interior" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAfwa40QREO_he5eKnbVS7C18Kg8DDkE6gkCQaNJZ9GJ-EMa45M67VQXVH_j5myLwlTD3aN7YCFVbmZqaPs7roSw49qBPo6C6Tf7oe0MlkAhKdB_2K6Mrl3yuT9QVqhpYpdbmggfsPInYbrdrGwA0Yoe2NTi22XFoP2m5GBltsetL-jrxGQqUknCIY_DmnDROZPm2xif9JmR_FwePLTbYa0ZqfpZEhLdy235mNzhrFtGe7DUNLgxprmOnyh7X6fLuDEfahzPdjzAMhV"/>
<div class="absolute top-2 left-2">
<span class="bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold font-headline text-primary">CAM_P03_OFFICE_EAST</span>
</div>
<div class="absolute top-2 right-2 text-[10px] font-headline text-on-surface-variant tracking-tighter">08:42:12.441</div>
</div>
<!-- Cam 7 -->
<div class="relative bg-surface-container-low border-l-2 border-primary overflow-hidden">
<img alt="" class="w-full h-full object-cover opacity-60 mix-blend-luminosity" data-alt="Server room with green glowing status lights" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDgtUQ3KoaeXewRMlWQ0ald1PkJjyMTbLT_YtdDCPlkLpF4mdSFC3TtmfjAYWcs3qEJZwaZgHdBgR6P-tu9dVw0qIILAlq0gARXptzb-4HgvdaSsmWm1QvTMS09qvEF8AjrXK9hElJtzI77G37-qvR-8MQmak8sU7EbS7751QDHNe2c34eVdIjbOOkbChE1Yky7fGPGlBGaD4jzTlduQDDEB10qrA_keTkalRmP8ssFkwS1cPHaMGq-SKcAMvgfrJQ5qKtYLI8E9ViD"/>
<div class="absolute top-2 left-2">
<span class="bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold font-headline text-primary">CAM_P12_SERVER_VAULT</span>
</div>
<div class="absolute top-2 right-2 text-[10px] font-headline text-on-surface-variant tracking-tighter">08:42:12.441</div>
</div>
<!-- Cam 8 (Caution state) -->
<div class="relative bg-surface-container-low border-l-2 border-secondary overflow-hidden">
<img alt="" class="w-full h-full object-cover opacity-60 mix-blend-luminosity" data-alt="Underground tunnel surveillance feed" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCxZvESVivnCHKUCunCKXr8CZ4Fzg7ih0uqqykme0bfqJA4Cib_Aa0L6Up3vyqwRJypz2qnbzotYgsKyR2rG5wHHcr6XkGMXnHDfJTy5_3S9yU8KCnuahU5YeyfSIGLDagNtXazrwbUJMKTRj75HKjn4tTjLegtQyxLqmt941NVueyDtI0RcxhSsWfIucJXUMzoaEwuV558Ng668NAHRuJdGfZQ4c823BCY1KZgHMrs8Kn-jYktNJAvg9bb8ax0hKneBDqZFQ9Pz2TO"/>
<div class="absolute top-2 left-2">
<span class="bg-secondary-container px-2 py-0.5 text-[10px] font-bold font-headline text-secondary-fixed">CAM_P05_TUNNEL_04</span>
</div>
<div class="absolute top-2 right-2 text-[10px] font-headline text-secondary tracking-tighter">08:42:12.441</div>
<div class="absolute bottom-2 left-2">
<span class="text-[9px] text-secondary font-bold tracking-widest uppercase">SCANNING_BIO_SIGNATURE...</span>
</div>
</div>
<!-- Cam 9 -->
<div class="relative bg-surface-container-low border-l-2 border-primary overflow-hidden">
<img alt="" class="w-full h-full object-cover opacity-60 mix-blend-luminosity" data-alt="Industrial parking garage security view" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBvCHF2AB70fJ6fv3mow_q9yFKoSXAPfxmsB4luB1KRoBfK_RxHKzKIeQdaRqtu1YHqazum_DJTMBzBgvE34IyYjW82opwCaBTZSk5xq25imG_I3Y4MtKC_DpFIoXcEI6osv9eQtI-ySmgHftVczweSB0hpPRMYhJVCdYbR0HQbcmh6vivV6-LJbFkziIJG7qS0giRjxXG2fBLtRSiy6cRxcHTG5-VP5QY13VcooYOQCqkmcUqdtMWaOg984xboEQnE_bwvzqpKfzUo"/>
<div class="absolute top-2 left-2">
<span class="bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold font-headline text-primary">CAM_P02_PARKING_G1</span>
</div>
<div class="absolute top-2 right-2 text-[10px] font-headline text-on-surface-variant tracking-tighter">08:42:12.441</div>
</div>
</section>
<!-- Right Intelligence Feed -->
<aside class="w-80 bg-surface-container-low border-l border-outline-variant/10 flex flex-col">
<div class="p-3 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-high">
<h2 class="font-headline font-black text-xs tracking-widest text-primary uppercase">Intel_Feed_Realtime</h2>
<span class="text-[9px] font-bold text-on-surface-variant">NODE_A1</span>
</div>
<!-- Feed Content -->
<div class="flex-grow overflow-y-auto">
<!-- Alert Item (CRITICAL) -->
<div class="px-3 py-2 border-b border-error/20 bg-error/5 group">
<div class="flex justify-between items-start mb-1">
<span class="font-headline text-[10px] font-bold text-tertiary">08:42:11</span>
<span class="text-[9px] font-bold px-1 bg-error-container text-tertiary">CRITICAL</span>
</div>
<div class="text-[11px] font-bold text-on-surface mb-0.5">[PERSON_ID_982] DETECTED</div>
<div class="text-[9px] font-medium text-on-surface-variant tracking-wider">LOC: CAM_P04_PERIMETER_B</div>
<div class="mt-2 text-[9px] text-tertiary uppercase font-black animate-pulse">Awaiting_Command...</div>
</div>
<!-- Alert Item (SCAN) -->
<div class="px-3 py-2 border-b border-outline-variant/10 hover:bg-surface-container-high transition-colors">
<div class="flex justify-between items-start mb-1">
<span class="font-headline text-[10px] font-bold text-on-surface-variant">08:42:09</span>
<span class="text-[9px] font-bold text-secondary">SCANNING</span>
</div>
<div class="text-[11px] font-bold text-on-surface mb-0.5">VEHICLE_TAG_REF_X99</div>
<div class="text-[9px] font-medium text-on-surface-variant tracking-wider">LOC: CAM_P02_PARKING_G1</div>
</div>
<!-- Alert Item (INFO) -->
<div class="px-3 py-2 border-b border-outline-variant/10 hover:bg-surface-container-high transition-colors">
<div class="flex justify-between items-start mb-1">
<span class="font-headline text-[10px] font-bold text-on-surface-variant">08:41:55</span>
<span class="text-[9px] font-bold text-primary">SECURE</span>
</div>
<div class="text-[11px] font-bold text-on-surface mb-0.5">SHIFT_ROTATION_DELTA_02</div>
<div class="text-[9px] font-medium text-on-surface-variant tracking-wider">LOC: CAM_P01_ROOF_OPTIC</div>
</div>
<!-- Alert Item (INFO) -->
<div class="px-3 py-2 border-b border-outline-variant/10 hover:bg-surface-container-high transition-colors">
<div class="flex justify-between items-start mb-1">
<span class="font-headline text-[10px] font-bold text-on-surface-variant">08:41:42</span>
<span class="text-[9px] font-bold text-primary">SECURE</span>
</div>
<div class="text-[11px] font-bold text-on-surface mb-0.5">DOOR_LOCK_ENGAGED</div>
<div class="text-[9px] font-medium text-on-surface-variant tracking-wider">LOC: CAM_P12_SERVER_VAULT</div>
</div>
<!-- Alert Item (SCAN) -->
<div class="px-3 py-2 border-b border-outline-variant/10 hover:bg-surface-container-high transition-colors">
<div class="flex justify-between items-start mb-1">
<span class="font-headline text-[10px] font-bold text-on-surface-variant">08:41:30</span>
<span class="text-[9px] font-bold text-secondary">ANOMALY</span>
</div>
<div class="text-[11px] font-bold text-on-surface mb-0.5">HEAT_SIGNATURE_INCREASE</div>
<div class="text-[9px] font-medium text-on-surface-variant tracking-wider">LOC: CAM_P05_TUNNEL_04</div>
</div>
<!-- Alert Item (INFO) -->
<div class="px-3 py-2 border-b border-outline-variant/10 hover:bg-surface-container-high transition-colors">
<div class="flex justify-between items-start mb-1">
<span class="font-headline text-[10px] font-bold text-on-surface-variant">08:41:22</span>
<span class="text-[9px] font-bold text-primary">SECURE</span>
</div>
<div class="text-[11px] font-bold text-on-surface mb-0.5">SYS_AUTO_DIAGNOSTIC</div>
<div class="text-[9px] font-medium text-on-surface-variant tracking-wider">LOC: GLOBAL_SYSTEM</div>
</div>
</div>
<!-- Footer Metrics -->
<div class="p-3 bg-surface-container-lowest grid grid-cols-2 gap-2 border-t border-outline-variant/20">
<div class="flex flex-col">
<span class="text-[8px] font-bold text-on-surface-variant uppercase">Network_Load</span>
<div class="flex items-end gap-1">
<span class="font-headline text-sm font-bold text-primary">42.8</span>
<span class="text-[8px] text-on-surface-variant pb-0.5">Gbps</span>
</div>
</div>
<div class="flex flex-col">
<span class="text-[8px] font-bold text-on-surface-variant uppercase">Threat_LVL</span>
<div class="flex items-end gap-1">
<span class="font-headline text-sm font-bold text-secondary">0.041</span>
<span class="text-[8px] text-on-surface-variant pb-0.5">SIGMA</span>
</div>
</div>
</div>
</aside>
</main>
<!-- Operational Overlay Elements -->
<div class="fixed bottom-4 left-20 pointer-events-none">
<div class="bg-surface-container-high/80 backdrop-blur-sm border border-primary/20 p-2">
<div class="text-[8px] font-black tracking-widest text-primary mb-1">SYSTEM_TELEMETRY</div>
<div class="flex gap-4">
<div class="h-10 w-32 relative bg-surface-container">
<!-- Faux Histogram -->
<div class="absolute inset-0 flex items-end gap-[1px] p-1">
<div class="bg-primary/40 w-1 h-[20%]"></div>
<div class="bg-primary/40 w-1 h-[35%]"></div>
<div class="bg-primary/40 w-1 h-[42%]"></div>
<div class="bg-primary/40 w-1 h-[80%]"></div>
<div class="bg-primary/40 w-1 h-[65%]"></div>
<div class="bg-primary/40 w-1 h-[90%]"></div>
<div class="bg-primary/40 w-1 h-[40%]"></div>
<div class="bg-primary/40 w-1 h-[30%]"></div>
</div>
</div>
</div>
</div>
</div>
<!-- Scanning Line (Global Visual Overlay) -->
<div class="fixed inset-0 pointer-events-none z-[100] opacity-10">
<div class="h-[2px] w-full bg-primary absolute top-0 animate-[scan_8s_linear_infinite]"></div>
</div>
<style>
        @keyframes scan {
            from { top: -2%; }
            to { top: 102%; }
        }
    </style>
</body></html>