export type ThemeMode = "light" | "dark";

export type ThemePreset = "default" | "light-cloud" | "dark-default" | "dark-crimson" | "dark-delta" | "light-bubblegum";

export interface ThemeColors {
  primary: string;
  primaryForeground: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  // Chart colors (for leaderboards, overlays, etc)
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  // Sidebar colors
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
}

export interface Theme {
  id: ThemePreset;
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
}

// Default theme (current QuickBuck theme)
const defaultLightColors: ThemeColors = {
  primary: "oklch(0.6735 0.201 33.2114)", // Orange/Blue
  primaryForeground: "oklch(1 0 0)",
  background: "oklch(1 0 0)",
  foreground: "oklch(0.1371 0.036 258.5258)",
  card: "oklch(1 0 0)",
  cardForeground: "oklch(0.1371 0.036 258.5258)",
  popover: "oklch(1 0 0)",
  popoverForeground: "oklch(0.1371 0.036 258.5258)",
  secondary: "oklch(0.9684 0.0068 247.8951)",
  secondaryForeground: "oklch(0.2079 0.0399 265.7275)",
  muted: "oklch(0.9684 0.0068 247.8951)",
  mutedForeground: "oklch(0.5547 0.0407 257.4404)",
  accent: "oklch(0.9684 0.0068 247.8951)",
  accentForeground: "oklch(0.2079 0.0399 265.7275)",
  destructive: "oklch(0.6368 0.2078 25.3259)",
  destructiveForeground: "oklch(1 0 0)",
  border: "oklch(0.929 0.0126 255.5317)",
  input: "oklch(0.929 0.0126 255.5317)",
  ring: "oklch(0.6735 0.201 33.2114)",
  chart1: "oklch(0.6735 0.201 33.2114)",
  chart2: "oklch(0.7076 0.1454 19.4123)",
  chart3: "oklch(0.6907 0.1236 234.6736)",
  chart4: "oklch(0.745 0.1897 149.5728)",
  chart5: "oklch(0.6283 0.1582 296.9932)",
  sidebar: "oklch(0.9837 0.0019 264.5449)",
  sidebarForeground: "oklch(0.1371 0.036 258.5258)",
  sidebarPrimary: "oklch(0.6735 0.201 33.2114)",
  sidebarPrimaryForeground: "oklch(1 0 0)",
  sidebarAccent: "oklch(0.9684 0.0068 247.8951)",
  sidebarAccentForeground: "oklch(0.2079 0.0399 265.7275)",
  sidebarBorder: "oklch(0.929 0.0126 255.5317)",
  sidebarRing: "oklch(0.6735 0.201 33.2114)",
};

const defaultDarkColors: ThemeColors = {
  primary: "oklch(0.6735 0.201 33.2114)", // Orange/Blue
  primaryForeground: "oklch(0.9838 0.0035 247.8583)",
  background: "oklch(0.1371 0.036 258.5258)",
  foreground: "oklch(0.9838 0.0035 247.8583)",
  card: "oklch(0.1371 0.036 258.5258)",
  cardForeground: "oklch(0.9838 0.0035 247.8583)",
  popover: "oklch(0.1371 0.036 258.5258)",
  popoverForeground: "oklch(0.9838 0.0035 247.8583)",
  secondary: "oklch(0.28 0.0369 259.974)",
  secondaryForeground: "oklch(0.9838 0.0035 247.8583)",
  muted: "oklch(0.28 0.0369 259.974)",
  mutedForeground: "oklch(0.7097 0.0355 256.7889)",
  accent: "oklch(0.28 0.0369 259.974)",
  accentForeground: "oklch(0.9838 0.0035 247.8583)",
  destructive: "oklch(0.3959 0.1331 25.7205)",
  destructiveForeground: "oklch(0.9838 0.0035 247.8583)",
  border: "oklch(0.28 0.0369 259.974)",
  input: "oklch(0.28 0.0369 259.974)",
  ring: "oklch(0.6735 0.201 33.2114)",
  chart1: "oklch(0.6735 0.201 33.2114)",
  chart2: "oklch(0.7076 0.1454 19.4123)",
  chart3: "oklch(0.6907 0.1236 234.6736)",
  chart4: "oklch(0.745 0.1897 149.5728)",
  chart5: "oklch(0.6283 0.1582 296.9932)",
  sidebar: "oklch(0.1647 0.0092 264.2809)",
  sidebarForeground: "oklch(0.9838 0.0035 247.8583)",
  sidebarPrimary: "oklch(0.6735 0.201 33.2114)",
  sidebarPrimaryForeground: "oklch(0.9838 0.0035 247.8583)",
  sidebarAccent: "oklch(0.28 0.0369 259.974)",
  sidebarAccentForeground: "oklch(0.9838 0.0035 247.8583)",
  sidebarBorder: "oklch(0.28 0.0369 259.974)",
  sidebarRing: "oklch(0.6735 0.201 33.2114)",
};

// Light Cloud theme (sky blue primary, cloud white background)
// Primary blue requested: #a2d2ff
const lightCloudColors: ThemeColors = {
  primary: "#a2d2ff",
  primaryForeground: "#001427",
  background: "#f7fbff",
  foreground: "#0f2435",
  card: "#ffffff",
  cardForeground: "#0f2435",
  popover: "#ffffff",
  popoverForeground: "#0f2435",
  secondary: "#e6f4ff",
  secondaryForeground: "#0f2435",
  muted: "#f1f8ff",
  mutedForeground: "#3b5566",
  accent: "#cfeeff",
  accentForeground: "#0f2435",
  destructive: "#ff6b6b",
  destructiveForeground: "#ffffff",
  border: "#e6f4ff",
  input: "#e6f4ff",
  ring: "#a2d2ff",
  chart1: "#a2d2ff", // main cloud blue
  chart2: "#79bfff",
  chart3: "#cfeeff",
  chart4: "#e8f8ff",
  chart5: "#8fb5ff",
  sidebar: "#f8fbff",
  sidebarForeground: "#0f2435",
  sidebarPrimary: "#a2d2ff",
  sidebarPrimaryForeground: "#001427",
  sidebarAccent: "#e6f4ff",
  sidebarAccentForeground: "#0f2435",
  sidebarBorder: "#e6f4ff",
  sidebarRing: "#a2d2ff",
};

// Dark Crimson theme (red primary, black background) - ALL orange replaced with red
const darkCrimsonColors: ThemeColors = {
  primary: "oklch(0.55 0.22 25)", // Red/Crimson
  primaryForeground: "oklch(0.98 0.01 0)",
  background: "oklch(0.08 0.01 0)", // Pure black
  foreground: "oklch(0.95 0.01 0)",
  card: "oklch(0.10 0.01 0)",
  cardForeground: "oklch(0.95 0.01 0)",
  popover: "oklch(0.10 0.01 0)",
  popoverForeground: "oklch(0.95 0.01 0)",
  secondary: "oklch(0.15 0.01 0)", // Very dark gray
  secondaryForeground: "oklch(0.95 0.01 0)",
  muted: "oklch(0.20 0.01 0)",
  mutedForeground: "oklch(0.65 0.01 0)",
  accent: "oklch(0.18 0.02 0)",
  accentForeground: "oklch(0.95 0.01 0)",
  destructive: "oklch(0.50 0.25 25)",
  destructiveForeground: "oklch(0.98 0.01 0)",
  border: "oklch(0.20 0.01 0)",
  input: "oklch(0.20 0.01 0)",
  ring: "oklch(0.55 0.22 25)",
  // All chart colors are red variants for leaderboards/overlays
  chart1: "oklch(0.55 0.22 25)", // Crimson red
  chart2: "oklch(0.60 0.20 20)", // Bright red
  chart3: "oklch(0.50 0.24 30)", // Dark red-orange
  chart4: "oklch(0.65 0.18 15)", // Light red
  chart5: "oklch(0.45 0.26 28)", // Deep crimson
  sidebar: "oklch(0.05 0.01 0)", // Almost pure black
  sidebarForeground: "oklch(0.95 0.01 0)",
  sidebarPrimary: "oklch(0.55 0.22 25)",
  sidebarPrimaryForeground: "oklch(0.98 0.01 0)",
  sidebarAccent: "oklch(0.15 0.01 0)",
  sidebarAccentForeground: "oklch(0.95 0.01 0)",
  sidebarBorder: "oklch(0.20 0.01 0)",
  sidebarRing: "oklch(0.55 0.22 25)",
};

// Delta theme (dark mode only)
const deltaColors: ThemeColors = {
  primary: "oklch(0.5967 0.2396 19.9561)",
  primaryForeground: "oklch(1.0000 0 0)",
  background: "oklch(0.1976 0.0527 271.1013)",
  foreground: "oklch(1.0000 0 0)",
  card: "oklch(0.2704 0.0563 266.9444)",
  cardForeground: "oklch(1.0000 0 0)",
  popover: "oklch(0.1976 0.0527 271.1013)",
  popoverForeground: "oklch(1.0000 0 0)",
  secondary: "oklch(0.3939 0.0763 263.1659)",
  secondaryForeground: "oklch(1.0000 0 0)",
  muted: "oklch(0.2704 0.0563 266.9444)",
  mutedForeground: "oklch(0.8144 0.0148 254.6221)",
  accent: "oklch(0.3939 0.0763 263.1659)",
  accentForeground: "oklch(1.0000 0 0)",
  destructive: "oklch(0.5967 0.2396 19.9561)",
  destructiveForeground: "oklch(1.0000 0 0)",
  border: "oklch(0.3939 0.0763 263.1659)",
  input: "oklch(0.2704 0.0563 266.9444)",
  ring: "oklch(0.5967 0.2396 19.9561)",
  chart1: "oklch(0.5967 0.2396 19.9561)",
  chart2: "oklch(0.5854 0.2041 277.1173)",
  chart3: "oklch(0.6231 0.1880 259.8145)",
  chart4: "oklch(0.7686 0.1647 70.0804)",
  chart5: "oklch(0.6959 0.1491 162.4796)",
  sidebar: "oklch(0.1976 0.0527 271.1013)",
  sidebarForeground: "oklch(1.0000 0 0)",
  sidebarPrimary: "oklch(0.5967 0.2396 19.9561)",
  sidebarPrimaryForeground: "oklch(1.0000 0 0)",
  sidebarAccent: "oklch(0.3939 0.0763 263.1659)",
  sidebarAccentForeground: "oklch(1.0000 0 0)",
  sidebarBorder: "oklch(0.2704 0.0563 266.9444)",
  sidebarRing: "oklch(0.5967 0.2396 19.9561)",
};

// Bubblegum theme (light mode only)
const bubblegumColors: ThemeColors = {
  primary: "oklch(0.5316 0.1409 355.1999)",
  primaryForeground: "oklch(1.0000 0 0)",
  background: "oklch(0.9754 0.0084 325.6414)",
  foreground: "oklch(0.3257 0.1161 325.0372)",
  card: "oklch(0.9754 0.0084 325.6414)",
  cardForeground: "oklch(0.3257 0.1161 325.0372)",
  popover: "oklch(1.0000 0 0)",
  popoverForeground: "oklch(0.3257 0.1161 325.0372)",
  secondary: "oklch(0.8696 0.0675 334.8991)",
  secondaryForeground: "oklch(0.4448 0.1341 324.7991)",
  muted: "oklch(0.9395 0.0260 331.5454)",
  mutedForeground: "oklch(0.4924 0.1244 324.4523)",
  accent: "oklch(0.8696 0.0675 334.8991)",
  accentForeground: "oklch(0.4448 0.1341 324.7991)",
  destructive: "oklch(0.5248 0.1368 20.8317)",
  destructiveForeground: "oklch(1.0000 0 0)",
  border: "oklch(0.8568 0.0829 328.9110)",
  input: "oklch(0.8517 0.0558 336.6002)",
  ring: "oklch(0.5916 0.2180 0.5844)",
  chart1: "oklch(0.6038 0.2363 344.4657)",
  chart2: "oklch(0.4445 0.2251 300.6246)",
  chart3: "oklch(0.3790 0.0438 226.1538)",
  chart4: "oklch(0.8330 0.1185 88.3461)",
  chart5: "oklch(0.7843 0.1256 58.9964)",
  sidebar: "oklch(0.9360 0.0288 320.5788)",
  sidebarForeground: "oklch(0.4948 0.1909 354.5435)",
  sidebarPrimary: "oklch(0.3963 0.0251 285.1962)",
  sidebarPrimaryForeground: "oklch(0.9668 0.0124 337.5228)",
  sidebarAccent: "oklch(0.9789 0.0013 106.4235)",
  sidebarAccentForeground: "oklch(0.3963 0.0251 285.1962)",
  sidebarBorder: "oklch(0.9383 0.0026 48.7178)",
  sidebarRing: "oklch(0.5916 0.2180 0.5844)",
};

export const themes: Theme[] = [
  {
    id: "default",
    name: "Default Light",
    mode: "light",
    colors: defaultLightColors,
  },
  {
    id: "light-cloud",
    name: "Cloud",
    mode: "light",
    colors: lightCloudColors,
  },
  {
    id: "dark-default",
    name: "Default Dark",
    mode: "dark",
    colors: defaultDarkColors,
  },
  {
    id: "dark-crimson",
    name: "Crimson",
    mode: "dark",
    colors: darkCrimsonColors,
  },
  {
    id: "dark-delta",
    name: "Delta",
    mode: "dark",
    colors: deltaColors,
  },
  {
    id: "light-bubblegum",
    name: "Bubblegum",
    mode: "light",
    colors: bubblegumColors,
  },
];

export const getThemeById = (id: ThemePreset): Theme | undefined => {
  return themes.find((theme) => theme.id === id);
};

export const applyThemeColors = (colors: ThemeColors, mode: ThemeMode) => {
  const root = document.documentElement;

  // First, remove all existing theme-related CSS variables to prevent persistence
  const existingStyles = root.style;
  const propertiesToRemove: string[] = [];

  for (let i = 0; i < existingStyles.length; i++) {
    const prop = existingStyles[i];
    // Remove all theme-related CSS variables
    if (prop.startsWith('--') && (
      prop.includes('primary') ||
      prop.includes('secondary') ||
      prop.includes('background') ||
      prop.includes('foreground') ||
      prop.includes('card') ||
      prop.includes('popover') ||
      prop.includes('muted') ||
      prop.includes('accent') ||
      prop.includes('destructive') ||
      prop.includes('border') ||
      prop.includes('input') ||
      prop.includes('ring') ||
      prop.includes('chart') ||
      prop.includes('sidebar')
    )) {
      propertiesToRemove.push(prop);
    }
  }

  // Remove the collected properties
  propertiesToRemove.forEach(prop => root.style.removeProperty(prop));

  // Apply new colors
  Object.entries(colors).forEach(([key, value]) => {
    // Convert camelCase to kebab-case for CSS variables
    let cssVar = key.replace(/([A-Z])/g, "-$1").toLowerCase();

    // Handle special cases for chart colors (chart1 -> chart-1)
    if (key.startsWith("chart")) {
      cssVar = cssVar.replace("chart", "chart-");
    }

    root.style.setProperty(`--${cssVar}`, value);
  });

  // Apply dark mode class
  root.classList.toggle("dark", mode === "dark");
};
