// Shared line icons — the same set as the Figma library's Icons page
// (24 grid, 1.8 stroke, currentColor). Used by three or more files, so they
// live here rather than beside each page (FIGMA_DESIGN_RULES §7).

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export function MapPinIcon(p: IconProps) {
  return <Svg {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></Svg>;
}
export function ShieldCheckIcon(p: IconProps) {
  return <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></Svg>;
}
export function RulerIcon(p: IconProps) {
  return <Svg {...p}><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" /><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" /></Svg>;
}
export function GridIcon(p: IconProps) {
  return <Svg {...p}><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></Svg>;
}
export function FileTextIcon(p: IconProps) {
  return <Svg {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8" /></Svg>;
}
export function MessageIcon(p: IconProps) {
  return <Svg {...p}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></Svg>;
}
export function LockIcon(p: IconProps) {
  return <Svg {...p}><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>;
}
export function InfoIcon(p: IconProps) {
  return <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></Svg>;
}
export function AlertIcon(p: IconProps) {
  return <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Svg>;
}
export function ChevronRightIcon(p: IconProps) {
  return <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
}
export function ChevronDownIcon(p: IconProps) {
  return <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
}
export function CheckIcon(p: IconProps) {
  return <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;
}
export function ShareIcon(p: IconProps) {
  return <Svg {...p}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" /></Svg>;
}
export function WalletIcon(p: IconProps) {
  return <Svg {...p}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></Svg>;
}
export function BuildingIcon(p: IconProps) {
  return <Svg {...p}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4" /></Svg>;
}
export function DropletIcon(p: IconProps) {
  return <Svg {...p}><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" /></Svg>;
}
export function RouteIcon(p: IconProps) {
  return <Svg {...p}><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></Svg>;
}
export function FenceIcon(p: IconProps) {
  return <Svg {...p}><path d="M4 3 2 5v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5ZM6 8h4M6 18h4M12 3l-2 2v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5ZM14 8h4M14 18h4M20 3l-2 2v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5Z" /></Svg>;
}
export function LightbulbIcon(p: IconProps) {
  return <Svg {...p}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4" /></Svg>;
}
export function MenuIcon(p: IconProps) {
  return <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>;
}

export function SearchIcon(p: IconProps) {
  return <Svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>;
}
export function DownloadIcon(p: IconProps) {
  return <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Svg>;
}
export function ImageIcon(p: IconProps) {
  return <Svg {...p}><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></Svg>;
}
export function ReceiptIcon(p: IconProps) {
  return <Svg {...p}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11" /></Svg>;
}
export function FileCheckIcon(p: IconProps) {
  return <Svg {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4M9 15l2 2 4-4" /></Svg>;
}

// An amenity's icon from its wording — the developer types amenities freely,
// so this matches on words and falls back to a tick.
export function AmenityIcon({ amenity, ...p }: IconProps & { amenity: string }) {
  const a = amenity.toLowerCase();
  if (/secur|guard|cctv|gate/.test(a)) return <ShieldCheckIcon {...p} />;
  if (/water|borehole|drain/.test(a)) return <DropletIcon {...p} />;
  if (/road|street(?! light)|access/.test(a)) return <RouteIcon {...p} />;
  if (/fence|wall/.test(a)) return <FenceIcon {...p} />;
  if (/light|power|electric|solar/.test(a)) return <LightbulbIcon {...p} />;
  return <CheckIcon {...p} />;
}
