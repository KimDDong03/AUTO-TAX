<!DOCTYPE html>

<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>TACTICAL_CMD_v4.0.2 - SYSTEM_SETTINGS</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&amp;family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            font-size: 16px;
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0d0f0f; }
        ::-webkit-scrollbar-thumb { background: #4b5320; }
        input[type="range"] {
            -webkit-appearance: none;
            background: #1c2021;
            height: 2px;
        }
        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 8px;
            height: 12px;
            background: #b9ce92;
            cursor: pointer;
        }
    </style>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        "error-container": "#7e2b17",
                        "tertiary": "#ff766c",
                        "on-primary": "#354518",
                        "surface-container": "#161a1a",
                        "primary": "#b9ce92",
                        "secondary": "#bf983e",
                        "surface-container-low": "#111414",
                        "surface-container-high": "#1c2021",
                        "surface-container-highest": "#212727",
                        "on-surface-variant": "#a6acac",
                        "surface": "#0d0f0f",
                        "background": "#0d0f0f"
                    },
                    fontFamily: {
                        "headline": ["Space Grotesk"],
                        "body": ["Inter"],
                        "label": ["Inter"]
                    },
                    borderRadius: {"none": "0", "DEFAULT": "0", "lg": "0", "xl": "0", "full": "9999px"},
                },
            },
        }
    </script>
</head>
<body class="bg-background text-on-surface font-body antialiased selection:bg-primary selection:text-on-primary">
<!-- TopAppBar Execution -->
<header class="fixed top-0 z-50 bg-[#0d0f0f] text-[#b9ce92] font-['Space_Grotesk'] uppercase tracking-tighter text-xs font-bold docked full-width border-none rounded-none flex justify-between items-center w-full px-4 h-10 overflow-hidden">
<div class="flex items-center gap-4">
<span class="text-sm font-black text-[#b9ce92] tracking-widest">TACTICAL_CMD_v4.0.2</span>
<span class="text-[#4b5320] opacity-50">|</span>
<span class="flex items-center gap-2"><span class="material-symbols-outlined text-[14px]">settings</span> CONFIG_NODE_01</span>
</div>
<div class="flex items-center gap-3">
<div class="flex items-center bg-[#1c2021] px-2 h-6 gap-2">
<span class="material-symbols-outlined text-[14px] text-[#4b5320]">search</span>
<input class="bg-transparent border-none outline-none text-[10px] w-32 placeholder:text-[#4b5320]" placeholder="SEARCH_PARAMS..." type="text"/>
</div>
<div class="flex gap-1">
<button class="h-8 w-8 flex items-center justify-center hover:bg-[#1c2021] transition-colors duration-100"><span class="material-symbols-outlined" data-icon="timer">timer</span></button>
<button class="h-8 w-8 flex items-center justify-center hover:bg-[#1c2021] transition-colors duration-100"><span class="material-symbols-outlined" data-icon="dns">dns</span></button>
<button class="h-8 w-8 flex items-center justify-center hover:bg-[#1c2021] transition-colors duration-100"><span class="material-symbols-outlined" data-icon="notifications_active">notifications_active</span></button>
</div>
</div>
</header>
<!-- SideNavBar Execution -->
<aside class="fixed left-0 top-10 h-[calc(100vh-2.5rem)] w-16 bg-[#111414] text-[#b9ce92] font-['Inter'] text-[10px] font-bold uppercase tracking-widest flex flex-col justify-between items-center py-0 z-40">
<nav class="w-full flex flex-col items-center">
<a class="w-full h-16 flex flex-col items-center justify-center gap-1 text-[#4b5320] hover:bg-[#1c2021] transition-all" href="#">
<span class="material-symbols-outlined" data-icon="videocam">videocam</span>
<span class="scale-[0.8]">Surv</span>
</a>
<a class="w-full h-16 flex flex-col items-center justify-center gap-1 text-[#4b5320] hover:bg-[#1c2021] transition-all" href="#">
<span class="material-symbols-outlined" data-icon="history">history</span>
<span class="scale-[0.8]">Arch</span>
</a>
<a class="w-full h-16 flex flex-col items-center justify-center gap-1 bg-[#1c2021] text-[#b9ce92] border-l-2 border-[#b9ce92]" href="#">
<span class="material-symbols-outlined" data-icon="settings">settings</span>
<span class="scale-[0.8]">Config</span>
</a>
</nav>
<div class="w-full flex flex-col items-center mb-4">
<button class="w-full h-12 flex items-center justify-center text-[#4b5320] hover:bg-[#1c2021]"><span class="material-symbols-outlined" data-icon="terminal">terminal</span></button>
<button class="w-full h-12 flex items-center justify-center text-[#4b5320] hover:bg-[#1c2021]"><span class="material-symbols-outlined" data-icon="logout">logout</span></button>
</div>
</aside>
<!-- Main Content Canvas -->
<main class="ml-16 mt-10 p-6 min-h-screen bg-surface">
<!-- Dashboard Header -->
<header class="mb-8">
<div class="flex items-baseline gap-4 mb-1">
<h1 class="font-headline text-3xl font-bold tracking-tighter text-primary uppercase">System_Parameters</h1>
<span class="font-headline text-sm text-on-surface-variant opacity-50 tracking-widest">V.4.0.2_STABLE</span>
</div>
<div class="h-px w-full bg-surface-container-highest"></div>
</header>
<div class="grid grid-cols-12 gap-8">
<!-- Column 1: Camera Grid & Config -->
<div class="col-span-12 lg:col-span-8 space-y-10">
<!-- Section: Camera Table -->
<section>
<div class="flex items-center justify-between mb-4">
<h2 class="font-headline text-[10px] font-bold tracking-[0.2em] text-secondary uppercase flex items-center gap-2">
<span class="w-2 h-2 bg-secondary"></span> Camera_Matrix_Deployment
                        </h2>
<button class="text-[10px] font-bold text-primary hover:underline transition-all">ADD_NEW_STREAM +</button>
</div>
<div class="overflow-x-auto">
<table class="w-full border-collapse text-[11px] font-medium tracking-tight text-on-surface-variant">
<thead>
<tr class="bg-surface-container-low text-primary text-left uppercase text-[9px] tracking-widest">
<th class="p-2 font-bold">ID</th>
<th class="p-2 font-bold">RTSP_Endpoint</th>
<th class="p-2 font-bold">Zone</th>
<th class="p-2 font-bold">Priority</th>
<th class="p-2 font-bold">Status</th>
<th class="p-2 font-bold text-right">Actions</th>
</tr>
</thead>
<tbody class="divide-y divide-surface-container-high">
<tr class="hover:bg-surface-container-low transition-colors group">
<td class="p-2 font-headline text-on-surface">CAM_001_N_ENT</td>
<td class="p-2 opacity-60">rtsp://192.168.1.104/stream1</td>
<td class="p-2">NORTH_PERIMETER</td>
<td class="p-2"><span class="px-1 bg-surface-container-highest border border-outline-variant">HIGH</span></td>
<td class="p-2 flex items-center gap-2">
<div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
<span>ACTIVE</span>
</td>
<td class="p-2 text-right">
<button class="material-symbols-outlined text-[14px] hover:text-primary mr-2">edit</button>
<button class="material-symbols-outlined text-[14px] hover:text-tertiary">block</button>
</td>
</tr>
<tr class="hover:bg-surface-container-low transition-colors group">
<td class="p-2 font-headline text-on-surface">CAM_002_S_EX</td>
<td class="p-2 opacity-60">rtsp://192.168.1.105/stream1</td>
<td class="p-2">SOUTH_EXIT</td>
<td class="p-2"><span class="px-1 bg-surface-container-highest border border-outline-variant text-[9px]">LOW</span></td>
<td class="p-2 flex items-center gap-2">
<div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
<span>ACTIVE</span>
</td>
<td class="p-2 text-right">
<button class="material-symbols-outlined text-[14px] hover:text-primary mr-2">edit</button>
<button class="material-symbols-outlined text-[14px] hover:text-tertiary">block</button>
</td>
</tr>
<tr class="hover:bg-surface-container-low transition-colors group">
<td class="p-2 font-headline text-on-surface text-tertiary">CAM_003_W_WHS</td>
<td class="p-2 opacity-60">rtsp://192.168.1.106/stream1</td>
<td class="p-2 text-tertiary">WAREHOUSE_W</td>
<td class="p-2"><span class="px-1 bg-surface-container-highest border border-outline-variant">MED</span></td>
<td class="p-2 flex items-center gap-2">
<div class="w-1.5 h-1.5 rounded-full bg-tertiary"></div>
<span class="text-tertiary">OFFLINE</span>
</td>
<td class="p-2 text-right">
<button class="material-symbols-outlined text-[14px] hover:text-primary mr-2">edit</button>
<button class="material-symbols-outlined text-[14px] text-primary">play_arrow</button>
</td>
</tr>
<tr class="hover:bg-surface-container-low transition-colors group">
<td class="p-2 font-headline text-on-surface">CAM_004_LAB_7</td>
<td class="p-2 opacity-60">rtsp://192.168.1.201/h264</td>
<td class="p-2">LABORATORY_INTERNAL</td>
<td class="p-2"><span class="px-1 bg-surface-container-highest border border-outline-variant">CRIT</span></td>
<td class="p-2 flex items-center gap-2">
<div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
<span>ACTIVE</span>
</td>
<td class="p-2 text-right">
<button class="material-symbols-outlined text-[14px] hover:text-primary mr-2">edit</button>
<button class="material-symbols-outlined text-[14px] hover:text-tertiary">block</button>
</td>
</tr>
<tr class="hover:bg-surface-container-low transition-colors group">
<td class="p-2 font-headline text-on-surface opacity-40">CAM_005_SRV_R</td>
<td class="p-2 opacity-20">rtsp://192.168.1.205/stream</td>
<td class="p-2 opacity-40">SERVER_ROOM</td>
<td class="p-2 opacity-40"><span class="px-1 bg-surface-container-highest border border-outline-variant">MED</span></td>
<td class="p-2 flex items-center gap-2 opacity-40">
<div class="w-1.5 h-1.5 rounded-full bg-on-surface-variant"></div>
<span>DISABLED</span>
</td>
<td class="p-2 text-right">
<button class="material-symbols-outlined text-[14px] hover:text-primary mr-2">edit</button>
<button class="material-symbols-outlined text-[14px] text-primary">play_arrow</button>
</td>
</tr>
</tbody>
</table>
</div>
</section>
<!-- Section: AI Thresholds -->
<section>
<div class="flex items-center gap-4 mb-4">
<h2 class="font-headline text-[10px] font-bold tracking-[0.2em] text-secondary uppercase flex items-center gap-2 whitespace-nowrap">
<span class="w-2 h-2 bg-secondary"></span> Neural_Logic_Thresholds
                        </h2>
<div class="h-px w-full bg-surface-container-highest"></div>
</div>
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
<div class="space-y-3">
<div class="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
<span>Detection_Confidence</span>
<span class="text-primary">0.82</span>
</div>
<input class="w-full" max="100" min="0" type="range" value="82"/>
<p class="text-[9px] text-on-surface-variant opacity-50">Minimum probability score for object classification.</p>
</div>
<div class="space-y-3">
<div class="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
<span>IOU_Overlapping</span>
<span class="text-primary">0.45</span>
</div>
<input class="w-full" max="100" min="0" type="range" value="45"/>
<p class="text-[9px] text-on-surface-variant opacity-50">Intersection over Union threshold for NMS suppression.</p>
</div>
<div class="space-y-3">
<div class="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
<span>Alert_Cooldown</span>
<span class="text-primary">12.0s</span>
</div>
<input class="w-full" max="60" min="0" type="range" value="12"/>
<p class="text-[9px] text-on-surface-variant opacity-50">Interval between duplicate event notifications.</p>
</div>
</div>
</section>
</div>
<!-- Column 2: Health & Metrics -->
<div class="col-span-12 lg:col-span-4 space-y-10">
<!-- Section: System Health -->
<section>
<div class="flex items-center gap-4 mb-4">
<h2 class="font-headline text-[10px] font-bold tracking-[0.2em] text-secondary uppercase flex items-center gap-2 whitespace-nowrap">
<span class="w-2 h-2 bg-secondary"></span> Hardware_Telemetry
                        </h2>
<div class="h-px w-full bg-surface-container-highest"></div>
</div>
<div class="bg-surface-container-low p-4 space-y-5">
<div class="space-y-1.5">
<div class="flex justify-between text-[10px] font-bold uppercase">
<span class="text-on-surface-variant">CPU_LOAD [EPYC_7402P]</span>
<span class="text-primary">42%</span>
</div>
<div class="h-1 bg-surface-container-highest w-full overflow-hidden">
<div class="h-full bg-primary" style="width: 42%"></div>
</div>
</div>
<div class="space-y-1.5">
<div class="flex justify-between text-[10px] font-bold uppercase">
<span class="text-on-surface-variant">GPU_UTIL [RTX_A6000]</span>
<span class="text-secondary">78%</span>
</div>
<div class="h-1 bg-surface-container-highest w-full overflow-hidden">
<div class="h-full bg-secondary" style="width: 78%"></div>
</div>
</div>
<div class="space-y-1.5">
<div class="flex justify-between text-[10px] font-bold uppercase">
<span class="text-on-surface-variant">MEM_ALLOC [64GB_ECC]</span>
<span class="text-primary">18.4GB</span>
</div>
<div class="h-1 bg-surface-container-highest w-full overflow-hidden">
<div class="h-full bg-primary" style="width: 28.7%"></div>
</div>
</div>
<div class="space-y-1.5">
<div class="flex justify-between text-[10px] font-bold uppercase">
<span class="text-on-surface-variant">STORAGE_IO</span>
<span class="text-primary">2.4 MB/s</span>
</div>
<div class="h-1 bg-surface-container-highest w-full overflow-hidden">
<div class="h-full bg-primary" style="width: 12%"></div>
</div>
</div>
</div>
</section>
<!-- Section: Environment Info -->
<section>
<div class="flex items-center gap-4 mb-4">
<h2 class="font-headline text-[10px] font-bold tracking-[0.2em] text-secondary uppercase flex items-center gap-2 whitespace-nowrap">
<span class="w-2 h-2 bg-secondary"></span> Node_Identity
                        </h2>
<div class="h-px w-full bg-surface-container-highest"></div>
</div>
<div class="space-y-4 text-[11px]">
<div class="flex justify-between border-b border-surface-container-highest pb-2">
<span class="text-on-surface-variant uppercase">Uptime:</span>
<span class="font-headline font-medium">144:12:09:44</span>
</div>
<div class="flex justify-between border-b border-surface-container-highest pb-2">
<span class="text-on-surface-variant uppercase">Kernel:</span>
<span class="font-headline font-medium text-primary">6.1.0-23-GENERIC</span>
</div>
<div class="flex justify-between border-b border-surface-container-highest pb-2">
<span class="text-on-surface-variant uppercase">IP_ADDR:</span>
<span class="font-headline font-medium">10.0.4.112</span>
</div>
<div class="flex justify-between border-b border-surface-container-highest pb-2">
<span class="text-on-surface-variant uppercase">Latency:</span>
<span class="font-headline font-medium text-primary">0.04ms</span>
</div>
</div>
</section>
<!-- Status Strip Footer (Contextual) -->
<div class="bg-surface-container-highest p-3 border-l-4 border-primary">
<p class="text-[9px] font-bold tracking-widest uppercase text-primary mb-1">Status: Operational</p>
<p class="text-[10px] leading-tight text-on-surface-variant">All diagnostic checks passed. Encryption active on all camera backhauls.</p>
</div>
</div>
</div>
<!-- System Log Snippet (Density Example) -->
<section class="mt-12 bg-surface-container-low border border-surface-container-highest">
<div class="flex items-center justify-between px-3 py-2 bg-surface-container-high">
<span class="text-[9px] font-bold tracking-widest text-primary uppercase">Direct_System_Output</span>
<span class="text-[9px] font-mono opacity-50">T-00:00:01</span>
</div>
<div class="p-3 font-mono text-[9px] leading-relaxed space-y-0.5 opacity-80">
<p><span class="text-primary">[INFO]</span> Initializing TensorRT engine for Node_Alpha...</p>
<p><span class="text-primary">[INFO]</span> CAM_001 handshake successful. Resolution set to 3840x2160.</p>
<p><span class="text-secondary">[WARN]</span> CAM_003 link stability flickering (Signal -68dBm).</p>
<p><span class="text-primary">[INFO]</span> Database sync complete. 14,021 frames indexed.</p>
<p><span class="text-primary">[INFO]</span> Thermal control active. Fans at 2400 RPM.</p>
</div>
</section>
</main>
<!-- Visual Identity Anchors (Hidden utility) -->
<div class="hidden" data-alt="Dark technical dashboard with green accents and data tables"></div>
</body></html>