import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { createBackgroundOutline } from './background-outline';
import { CalendarClock, LocateFixed, Minus, Plus } from 'lucide-react';
import {
  categoryIconScale,
  categoryIconContentScale,
  categoryIconBackgroundColor,
  categoryColorizeIcon,
  categoryMarkerStyle,
  categoryOutlineColor,
  categoryOutlineEnabled,
  categoryOutlineWidth,
  categoryShadowBlur,
  categoryShadowColor,
  categoryShadowEnabled,
  categoryShadowOpacity,
  type MapCategory,
  type MapItem,
  type MapSettings,
  type MarkerStyle,
} from '../domain/models';
import { localizeCategory, localizeEvent, localizeItem, localeName } from '../domain/localization';
import { getCategoryIconUrl } from './CategoryIcon';
import { PhoneClientPreview } from './PhoneClientPreview';
import { groupEntries, itemIconColor } from '../domain/groups';
import { accentVariables } from '../domain/accent';
import { PhoneGroupPreview } from './PhoneGroupPreview';
import { nextVisibleEventOccurrence, PhoneEventPanel } from './PhoneEventPanel';
import { PhoneMapSearch } from './PhoneMapSearch';
import { visitorCopy } from './visitor-i18n';
import 'leaflet/dist/leaflet.css';
import './map-canvas.css';
import { useMapFont } from './useMapFont';
import { showZones, zoneAppearance, zoneTitle } from '../domain/zones';

import type { VisitorMap } from '../data/visitor-map';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { observeZoneVisibility } from './zone-visibility';
import { finishTouchZoomImmediately } from './touch-zoom';
import { observeCompass, VISITOR_POSITION, VISITOR_FOCUS_SCALE } from './visitor-location';

export interface NormalizedPosition { x: number; y: number }
export interface ImagePoint { x: number; y: number }
const DEFAULT_MARKER_COLOR = '#315f4b';
const DEFAULT_DIMENSION = 1;


export function zoomLimitsForFit(fitZoom: number, settings: Pick<MapSettings, 'minZoomScale' | 'maxZoomScale'>): { minZoom: number; maxZoom: number } {
  const minZoom = fitZoom + Math.log2(settings.minZoomScale);
  const maxZoom = fitZoom + Math.log2(settings.maxZoomScale);
  return { minZoom, maxZoom: Math.max(minZoom, maxZoom) };
}

export function relativeZoomScale(zoom: number, fitZoom: number): number {
  return 2 ** (zoom - fitZoom);
}

export function zoomForRelativeScale(fitZoom: number, scale: number): number {
  return fitZoom + Math.log2(scale);
}

export function unconstrainedFitZoom(
  map: L.Map,
  imageBounds: L.LatLngBounds,
  padding: [number, number],
): number {
  const currentZoom = map.getZoom();
  const referenceZoom = Number.isFinite(currentZoom) ? currentZoom : 0;
  const projectedBounds = L.bounds(
    map.project(imageBounds.getNorthWest(), referenceZoom),
    map.project(imageBounds.getSouthEast(), referenceZoom),
  );
  const boundsSize = projectedBounds.getSize();
  const viewportSize = map.getSize().subtract(L.point(padding[0], padding[1]));
  if (boundsSize.x <= 0 || boundsSize.y <= 0 || viewportSize.x <= 0 || viewportSize.y <= 0) {
    return referenceZoom;
  }
  const scale = Math.min(viewportSize.x / boundsSize.x, viewportSize.y / boundsSize.y);
  return map.getScaleZoom(scale, referenceZoom);
}

export function navigationLimitPoints(
  width: number,
  height: number,
  settings: Pick<MapSettings, 'navigationPaddingX' | 'navigationPaddingY'>,
): { southWest: [number, number]; northEast: [number, number] } {
  const horizontal = width * settings.navigationPaddingX;
  const vertical = height * settings.navigationPaddingY;
  return {
    southWest: [-vertical, -horizontal],
    northEast: [height + vertical, width + horizontal],
  };
}

export function clampFocusCenter(
  map: Pick<L.Map, 'project' | 'unproject' | 'getSize'>,
  target: L.LatLngExpression,
  zoom: number,
  bounds: L.LatLngBounds,
): L.LatLng {
  const targetPoint = map.project(L.latLng(target), zoom)
  const northWest = map.project(bounds.getNorthWest(), zoom)
  const southEast = map.project(bounds.getSouthEast(), zoom)
  const min = L.point(Math.min(northWest.x, southEast.x), Math.min(northWest.y, southEast.y))
  const max = L.point(Math.max(northWest.x, southEast.x), Math.max(northWest.y, southEast.y))
  const halfViewport = map.getSize().divideBy(2)

  const clampAxis = (value: number, lower: number, upper: number) => (
    lower <= upper ? Math.min(upper, Math.max(lower, value)) : (lower + upper) / 2
  )

  return map.unproject(L.point(
    clampAxis(targetPoint.x, min.x + halfViewport.x, max.x - halfViewport.x),
    clampAxis(targetPoint.y, min.y + halfViewport.y, max.y - halfViewport.y),
  ), zoom)
}

export function quickPreviewWouldCoverPoint(
  point: Pick<L.Point, 'y'>,
  viewport: Pick<L.Point, 'y'>,
): boolean {
  const quickPreviewTop = viewport.y - 14.5 - 132
  const markerClearance = 36
  return point.y + markerClearance >= quickPreviewTop
}

function applyMapViewSettings(
  map: L.Map,
  imageBounds: L.LatLngBounds,
  width: number,
  height: number,
  settings: MapSettings,
  padding: [number, number],
): void {
  const limits = navigationLimitPoints(width, height, settings);
  map.setMaxBounds(L.latLngBounds(limits.southWest, limits.northEast));
  const fitZoom = unconstrainedFitZoom(map, imageBounds, padding);
  const { minZoom, maxZoom } = zoomLimitsForFit(fitZoom, settings);
  map.setMinZoom(minZoom);
  map.setMaxZoom(maxZoom);
  const currentZoom = map.getZoom();
  if (Number.isFinite(currentZoom) && (currentZoom < minZoom || currentZoom > maxZoom)) {
    map.setZoom(Math.min(maxZoom, Math.max(minZoom, currentZoom)), { animate: false });
  }
}

export function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function assertDimensions(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Map dimensions must be finite positive numbers.');
  }
}

/** Converts top-left-origin image pixels to resolution-independent coordinates. */
export function normalizePoint(point: ImagePoint, width: number, height: number): NormalizedPosition {
  assertDimensions(width, height);
  return {
    x: clampNormalized(point.x / width),
    y: clampNormalized(point.y / height),
  };
}

/** Converts resolution-independent coordinates to top-left-origin image pixels. */
export function denormalizePosition(
  position: NormalizedPosition,
  width: number,
  height: number,
): ImagePoint {
  assertDimensions(width, height);
  return {
    x: clampNormalized(position.x) * width,
    y: clampNormalized(position.y) * height,
  };
}

/** Leaflet's Simple CRS has its origin at the bottom-left; image data uses top-left. */
export function positionToLatLng(
  position: NormalizedPosition,
  width: number,
  height: number,
): L.LatLngLiteral {
  const point = denormalizePosition(position, width, height);
  return { lat: height - point.y, lng: point.x };
}

function safeDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DIMENSION;
}

function safeMarkerColor(color: string | undefined): string {
  if (!color) return DEFAULT_MARKER_COLOR;
  const normalized = color.trim();
  return /^(#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\))$/i.test(normalized)
    ? normalized
    : DEFAULT_MARKER_COLOR;
}

export function markerVisualMetrics(markerStyle: MarkerStyle, iconScale: number) {
  const baseWidth = markerStyle === 'image' ? 72.6 : markerStyle === 'pin' ? 52 : 49.5
  const baseHeight = markerStyle === 'pin' ? 68 : baseWidth
  return {
    bodyWidth: baseWidth * iconScale,
    bodyHeight: baseHeight * iconScale,
    iconWidth: baseWidth * iconScale,
    iconHeight: baseHeight * iconScale,
  }
}

const PHONE_PREVIEW_MARKER_SCALE = 1

export function markerIconAnchor(
  markerStyle: MarkerStyle,
  iconWidth: number,
  iconHeight: number,
): [number, number] {
  return markerStyle === 'pin'
    ? [iconWidth / 2, iconHeight]
    : [iconWidth / 2, iconHeight / 2]
}

export function markerTooltipAnchor(markerStyle: MarkerStyle, iconHeight: number): [number, number] {
  return [0, markerStyle === 'pin' ? -iconHeight : -(iconHeight / 2)]
}


export function markerShadowColor(color: string, opacity: number, enabled = true): string {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color)
  const [red, green, blue] = match
    ? [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)]
    : [0, 0, 0]
  const alpha = enabled ? Math.min(100, Math.max(0, opacity)) / 100 : 0
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function resolveMarkerIconUrl(iconUrl: string | null | undefined, categoryType: string): string {
  return iconUrl ?? getCategoryIconUrl(categoryType)
}

function markerOutlineFilterId(markerId: string): string {
  let hash = 2166136261
  for (let index = 0; index < markerId.length; index += 1) {
    hash ^= markerId.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `map-canvas-marker-outline-${(hash >>> 0).toString(36)}`
}

function effectiveMarkerCategory(item: MapItem, category: MapCategory | undefined): MapCategory | undefined {
  return category ? {
    ...category,
    ...item.markerOverrides,
    color: itemIconColor(item, category),
  } : undefined
}

function createMarkerIcon(
  item: MapItem,
  category: MapCategory | undefined,
  selected: boolean,
  iconUrl: string | null | undefined,
  phonePreview = false,
): L.DivIcon {
  const isAnimal = item.type === 'animal'
  const effectiveCategory = effectiveMarkerCategory(item, category)
  const markerStyle: MarkerStyle = effectiveCategory ? categoryMarkerStyle(effectiveCategory) : isAnimal ? 'image' : 'circle'
  const iconScale = effectiveCategory ? categoryIconScale(effectiveCategory) : 1
  const iconContentScale = effectiveCategory ? categoryIconContentScale(effectiveCategory) : 1
  const iconBackgroundColor = effectiveCategory ? categoryIconBackgroundColor(effectiveCategory) : '#FFFFFF'
  const colorizeIcon = effectiveCategory ? categoryColorizeIcon(effectiveCategory) : false
  const outlineEnabled = effectiveCategory ? categoryOutlineEnabled(effectiveCategory) : false
  const outlineWidth = effectiveCategory ? categoryOutlineWidth(effectiveCategory) : 2
  const outlineColor = effectiveCategory ? categoryOutlineColor(effectiveCategory) : '#FF0000'
  const shadowEnabled = effectiveCategory ? categoryShadowEnabled(effectiveCategory) : true
  const shadowBlur = effectiveCategory ? categoryShadowBlur(effectiveCategory) : 10
  const shadowOpacity = effectiveCategory ? categoryShadowOpacity(effectiveCategory) : 22
  const shadowColor = effectiveCategory ? categoryShadowColor(effectiveCategory) : '#000000'
  const previewScale = phonePreview ? PHONE_PREVIEW_MARKER_SCALE : 1
  const { bodyWidth, bodyHeight, iconWidth, iconHeight } = markerVisualMetrics(markerStyle, iconScale * previewScale)
  const body = document.createElement('span');
  body.className = `map-canvas__marker ${isAnimal ? 'is-animal' : 'is-poi'} is-${markerStyle}${colorizeIcon ? ' is-colorized' : ''}${outlineEnabled ? ' has-outline' : ''}${selected ? ' is-selected' : ''}`;
  body.style.setProperty('--marker-color', safeMarkerColor(effectiveCategory?.color));
  body.style.setProperty('--marker-category-color', safeMarkerColor(effectiveCategory?.color));
  body.style.setProperty('--marker-width', `${bodyWidth}px`);
  body.style.setProperty('--marker-height', `${bodyHeight}px`);
  body.style.setProperty('--marker-content-scale', `${iconContentScale}`);
  body.style.setProperty('--marker-background-color', safeMarkerColor(iconBackgroundColor));
  body.style.setProperty('--marker-outline-width', `${outlineWidth}px`);
  body.style.setProperty('--marker-outline-color', safeMarkerColor(outlineColor));
  body.style.setProperty('--marker-shadow-blur', `${shadowBlur}px`);
  body.style.setProperty('--marker-shadow-offset', `${shadowBlur * 0.6}px`);
  body.style.setProperty('--marker-shadow-color', markerShadowColor(shadowColor, shadowOpacity, shadowEnabled));
  if (outlineEnabled && category) {
    body.style.setProperty('--marker-outline-filter', `url("#${markerOutlineFilterId(item.id)}")`);
  }
  body.setAttribute('aria-hidden', 'true');

  let contentHost: HTMLElement = body;
  if (markerStyle === 'pin') {
    const pinBackground = document.createElement('span');
    pinBackground.className = 'map-canvas__pin-background';
    body.append(pinBackground);

    const pinShape = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pinShape.classList.add('map-canvas__pin-shape');
    pinShape.setAttribute('viewBox', '0 0 52 68');
    pinShape.setAttribute('preserveAspectRatio', 'none');
    const pinPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pinPath.setAttribute('d', 'M26 66C22 58 4 43 4 27C4 14.3 13.8 4 26 4S48 14.3 48 27C48 43 30 58 26 66Z');
    pinShape.append(pinPath);
    body.append(pinShape);

    const pinContent = document.createElement('span');
    pinContent.className = 'map-canvas__pin-content';
    body.append(pinContent);
    contentHost = pinContent;
  }

  const resolvedIconUrl = resolveMarkerIconUrl(iconUrl, effectiveCategory?.type ?? item.type)
  if (resolvedIconUrl) {
    if (colorizeIcon) {
      const mask = document.createElement('span');
      mask.className = 'map-canvas__marker-mask is-colorized';
      mask.style.setProperty('-webkit-mask-image', `url("${resolvedIconUrl}")`);
      mask.style.setProperty('mask-image', `url("${resolvedIconUrl}")`);
      if (isAnimal && markerStyle === 'circle') {
        const clip = document.createElement('span');
        clip.className = 'map-canvas__marker-image-clip';
        clip.append(mask);
        body.append(clip);
      } else {
        contentHost.append(mask);
      }
    } else if (item.iconAssetId || effectiveCategory?.defaultIconAssetId) {
      const image = document.createElement('img');
      image.className = 'map-canvas__marker-image';
      image.src = resolvedIconUrl;
      image.alt = '';
      image.draggable = false;
      if (markerStyle === 'circle') {
        const clip = document.createElement('span');
        clip.className = 'map-canvas__marker-image-clip';
        clip.append(image);
        body.append(clip);
      } else {
        contentHost.append(image);
      }
    } else {
      const mask = document.createElement('span');
      mask.className = 'map-canvas__marker-mask';
      mask.style.setProperty('-webkit-mask-image', `url("${resolvedIconUrl}")`);
      mask.style.setProperty('mask-image', `url("${resolvedIconUrl}")`);
      contentHost.append(mask);
    }
  }

  const wrapper = document.createElement('span');
  wrapper.className = 'map-marker-group';
  wrapper.append(body);
  if (item.members?.length) {
    const badge = document.createElement('span');
    badge.className = 'map-marker-group__count';
    const count = `+${item.members.length}`;
    const size = Math.max(23, count.length * 7 + 8);
    badge.style.setProperty('--group-badge-size', `${size}px`);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    label.setAttribute('viewBox', `0 0 ${size - 4} ${size - 4}`);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', '50%');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = count;
    label.append(text);
    badge.append(label);
    wrapper.append(badge);
  }
  return L.divIcon({
    className: 'map-canvas__marker-icon',
    html: wrapper,
    iconSize: [iconWidth, iconHeight],
    iconAnchor: markerIconAnchor(markerStyle, iconWidth, iconHeight),
    tooltipAnchor: markerTooltipAnchor(markerStyle, iconHeight),
  });
}

function categorySignature(category: MapCategory | undefined): string {
  return category ? [
    category.id,
    category.color,
    category.visible,
    categoryMarkerStyle(category),
    categoryIconScale(category),
    categoryIconContentScale(category),
    categoryIconBackgroundColor(category),
    categoryColorizeIcon(category),
    categoryOutlineEnabled(category),
    categoryOutlineWidth(category),
    categoryOutlineColor(category),
    categoryShadowEnabled(category),
    categoryShadowBlur(category),
    categoryShadowOpacity(category),
    categoryShadowColor(category),
  ].join(':') : 'missing';
}

function createTooltipContent(title: string): HTMLElement {
  const content = document.createElement('span');
  content.textContent = title;
  return content;
}


/** Visitor-only controller. Leaflet owns camera motion; React never renders per pan frame. */
export function MapCanvas({ data }: { data: VisitorMap }) {
  const { raster, backgroundUrl, backgroundWidth, backgroundHeight, backgroundColor, mapSettings,
    items: sourceItems, categories: sourceCategories, events: sourceEvents, defaultLocale,
    enabledLocales, assetUrls: fontAssetUrls, getItemIconUrl, getItemImageUrl, getItemImageUrls,
    getCategoryIconUrl: resolveCategoryIconUrl, getFactIconUrl } = data;
  const phonePreview = true;
  const ariaLabel = 'Interaktive Zoo-Karte';
  const fontFamily = useMapFont(mapSettings.typography, fontAssetUrls);
  const zoneFontFamily = useMapFont(mapSettings.zones?.typography, fontAssetUrls);
  const [zonesVisible, setZonesVisible] = useState(() => showZones(mapSettings.zones, 1));
  const [clientPreviewItemId, setClientPreviewItemId] = useState<string | null>(null);
  const [clientMemberId, setClientMemberId] = useState<string | null>(null);
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false);
  const [clientEventsOpen, setClientEventsOpen] = useState(false);
  const [eventClock, setEventClock] = useState(() => new Date());
  const [visitorLocale, setVisitorLocale] = useState(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('zooweb-map-locale'); } catch { /* Private browsers may deny storage. */ }
    return [new URLSearchParams(location.search).get('lang'), saved, navigator.language.split('-')[0], defaultLocale]
      .find((locale): locale is string => Boolean(locale && enabledLocales.includes(locale))) ?? defaultLocale;
  });
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [hiddenVisitorCategoryIds, setHiddenVisitorCategoryIds] = useState<Set<string>>(() => new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const compassRef = useRef<ReturnType<typeof observeCompass> | null>(null);
  const [compassNotice, setCompassNotice] = useState<string | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const fitZoomRef = useRef<number | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const markerSignaturesRef = useRef(new Map<string, string>());
  const renderLocale = visitorLocale;
  const categories = useMemo(() => sourceCategories.map(category => localizeCategory(category, renderLocale, defaultLocale)), [sourceCategories, renderLocale, defaultLocale]);
  const items = useMemo(() => sourceItems.map(item => localizeItem(item, renderLocale, defaultLocale)), [sourceItems, renderLocale, defaultLocale]);
  const events = useMemo(() => sourceEvents.map(event => localizeEvent(event, renderLocale, defaultLocale)), [sourceEvents, renderLocale, defaultLocale]);
  const categoriesById = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories]);
  const clientCopy = visitorCopy(visitorLocale);
  const currentRef = useRef(data);
  currentRef.current = data;
  const closePanels = () => { setClientDetailsOpen(false); setClientEventsOpen(false); setClientPreviewItemId(null); };
  useDialogFocus(clientDetailsOpen || clientEventsOpen, closePanels);

  useEffect(() => {
    document.documentElement.lang = visitorLocale;
    if (!enabledLocales.includes(visitorLocale)) setVisitorLocale(defaultLocale);
  }, [visitorLocale, enabledLocales, defaultLocale]);
  const chooseVisitorLocale = (locale: string) => {
    setVisitorLocale(locale);
    try { localStorage.setItem('zooweb-map-locale', locale); } catch { /* Optional preference. */ }
    setLanguageMenuOpen(false);
  };

  useEffect(() => {
    const map = L.map(containerRef.current!, {
      crs: Object.assign({}, L.CRS.Simple, { transformation: new L.Transformation(1, 0, -1, backgroundHeight) }), zoomControl: false, doubleClickZoom: false, attributionControl: false,
      minZoom: -10, maxZoom: 10, zoomSnap: 0, zoomDelta: .5, wheelPxPerZoomLevel: 90,
      bounceAtZoomLimits: false,
      maxBoundsViscosity: .65, inertia: true, fadeAnimation: false, trackResize: false,
    });
    mapRef.current = map;
    const disposeTouchZoom = finishTouchZoomImmediately(map);
    for (const name of ['visitorMarkers', 'visitorZones']) {
      const pane = map.createPane(name);
      pane.style.zIndex = '600';
    }
    map.on('click', closePanels);
    let frame = 0;
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = boundsRef.current;
        if (!bounds || !Number.isFinite(map.getZoom())) return;
        const d = currentRef.current;
        map.stop();
        const center = map.getCenter();
        const oldFit = fitZoomRef.current ?? unconstrainedFitZoom(map, bounds, [14, 14]);
        const scale = relativeZoomScale(map.getZoom(), oldFit);
        map.invalidateSize({ pan: false });
        applyMapViewSettings(map, bounds, d.backgroundWidth, d.backgroundHeight, d.mapSettings, [14, 14]);
        const fit = unconstrainedFitZoom(map, bounds, [14, 14]);
        fitZoomRef.current = fit;
        const zoom = fit + Math.log2(scale);
        const targetZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));
        const limits = navigationLimitPoints(d.backgroundWidth, d.backgroundHeight, d.mapSettings);
        const destination = clampFocusCenter(map, center, targetZoom, L.latLngBounds(limits.southWest, limits.northEast));
        map.stop();
        if (scale <= Math.max(1.1, d.mapSettings.minZoomScale + .05)) {
          map.fitBounds(bounds, { animate: false, padding: [14, 14] });
        } else {
          map.setView(destination, targetZoom, { animate: false });
        }
      });
    });
    resize.observe(containerRef.current!);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); disposeTouchZoom(); map.remove(); mapRef.current = null; markersRef.current.clear(); markerSignaturesRef.current.clear(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current!;
    const bounds = L.latLngBounds([0, 0], [backgroundHeight, backgroundWidth]);
    boundsRef.current = bounds;
    const overlay = L.imageOverlay(raster?.previewUrl ?? backgroundUrl, bounds, { interactive: false, className: 'map-canvas__background', pane: 'tilePane', zIndex: 1 }).addTo(map);
    // Cap retina delivery at 2x; avoid 3x/4x tile memory on high-density phones.
    const density = window.devicePixelRatio > 1 ? 2 : 1;
    const retinaZoom = density === 2 ? 1 : 0;
    const tiles = raster ? L.tileLayer(raster.tileUrl, {
      tileSize: raster.tileSize / density, minZoom: -12, maxZoom: 12,
      minNativeZoom: raster.minNativeZoom - retinaZoom, maxNativeZoom: raster.maxNativeZoom - retinaZoom,
      zoomOffset: raster.zoomOffset + retinaZoom, bounds, noWrap: true, keepBuffer: 1,
      updateWhenIdle: true, updateWhenZooming: false, zIndex: 2, className: 'map-raster-tiles',
    }).addTo(map) : null;
    applyMapViewSettings(map, bounds, backgroundWidth, backgroundHeight, mapSettings, [14, 14]);
    map.fitBounds(bounds, { animate: false, padding: [14, 14] });
    fitZoomRef.current = unconstrainedFitZoom(map, bounds, [14, 14]);
    return () => { overlay.remove(); tiles?.remove(); };
  }, [backgroundUrl, backgroundWidth, backgroundHeight, raster]);

  useEffect(() => {
    const map = mapRef.current!;
    const pane = map.getPane('visitorPosition') ?? map.createPane('visitorPosition');
    pane.style.zIndex = '610';
    pane.style.pointerEvents = 'none';
    const arrow = document.createElement('span');
    arrow.className = 'visitor-position__arrow';
    arrow.innerHTML = '<svg viewBox="0 0 40 48" aria-hidden="true"><path d="M20 3 36 42 20 34 4 42Z"/></svg>';
    const marker = L.marker(positionToLatLng(VISITOR_POSITION, backgroundWidth, backgroundHeight), {
      pane: 'visitorPosition', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'visitor-position', html: arrow, iconSize: [40, 48], iconAnchor: [20, 24] }),
    }).addTo(map);
    const element = marker.getElement()!;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', clientCopy.myLocation);
    const compass = observeCompass(heading => {
      arrow.style.transform = `rotate(${heading}deg)`;
      arrow.dataset.heading = String(heading);
    });
    compassRef.current = compass;
    return () => { compass.dispose(); compassRef.current = null; marker.remove(); };
  }, [backgroundWidth, backgroundHeight, clientCopy.myLocation]);

  useEffect(() => {
    if (!compassNotice) return;
    const timer = window.setTimeout(() => setCompassNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [compassNotice]);

  const focusVisitor = () => {
    // Ask permission synchronously from the tap; moving the camera never waits.
    const compass = compassRef.current;
    void compass?.enable().then(status => {
      if (compassRef.current !== compass) return;
      setCompassNotice(status === 'ready' ? null : visitorLocale === 'de'
        ? status === 'insecure' ? 'Für den Kompass ist eine sichere HTTPS-Verbindung erforderlich.'
          : status === 'denied' ? 'Kompass-Zugriff nicht erlaubt.' : 'Kompass wird von diesem Gerät oder Browser nicht unterstützt.'
        : status === 'insecure' ? 'The compass requires a secure HTTPS connection.'
          : status === 'denied' ? 'Compass permission was not granted.' : 'Compass is not supported by this device or browser.');
    });
    closePanels();
    setLanguageMenuOpen(false);
    const map = mapRef.current;
    if (!map || !boundsRef.current) return;
    const fit = unconstrainedFitZoom(map, boundsRef.current, [14, 14]);
    const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), fit + Math.log2(VISITOR_FOCUS_SCALE)));
    const limits = navigationLimitPoints(backgroundWidth, backgroundHeight, mapSettings);
    const center = clampFocusCenter(map, positionToLatLng(VISITOR_POSITION, backgroundWidth, backgroundHeight), zoom,
      L.latLngBounds(limits.southWest, limits.northEast));
    map.flyTo(center, zoom, { duration: .45, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
  };

  useEffect(() => {
    const map = mapRef.current!;
    const bounds = boundsRef.current!;
    applyMapViewSettings(map, bounds, backgroundWidth, backgroundHeight, mapSettings, [14, 14]);
    const fitZoom = () => unconstrainedFitZoom(map, bounds, [14, 14]);
    const background = containerRef.current?.querySelector<HTMLElement>('.map-canvas__background');
    return observeZoneVisibility(map, mapSettings.zones, fitZoom,
      () => background ? background.getBoundingClientRect().width / (backgroundWidth * 2 ** fitZoom()) : undefined,
      (visible) => {
        // Existing markers continue following Leaflet's animation in both panes.
        // Only visibility changes at the threshold; no marker creation on a zoom frame.
        for (const [name, shown] of [['visitorZones', visible], ['visitorMarkers', !visible]] as const) {
          const pane = map.getPane(name)!;
          pane.style.visibility = shown ? 'visible' : 'hidden';
          pane.inert = !shown;
          pane.setAttribute('aria-hidden', String(!shown));
        }
        setZonesVisible(visible);
      });
  }, [mapSettings, backgroundWidth, backgroundHeight, backgroundUrl, raster]);

  useEffect(() => {
    const map = mapRef.current!;
    const ids = new Set<string>();
    for (const item of items) {
      const category = categoriesById.get(item.categoryId);
      if (!item.visible || !category?.visible || hiddenVisitorCategoryIds.has(item.categoryId)) continue;
      ids.add(item.id);
      const iconUrl = getItemIconUrl(item, category);
      const signature = JSON.stringify([item, categorySignature(category), iconUrl]);
      let marker = markersRef.current.get(item.id);
      if (!marker) {
        marker = L.marker(positionToLatLng(item.position, backgroundWidth, backgroundHeight), {
          draggable: false, keyboard: true, riseOnHover: true, title: item.title, alt: item.title,
          pane: 'visitorMarkers',
          icon: createMarkerIcon(item, category, false, iconUrl, true), bubblingMouseEvents: false,
        }).addTo(map);
        if (matchMedia('(hover: hover)').matches) marker.bindTooltip(createTooltipContent(item.title), { className: 'map-canvas__point-tooltip', direction: 'top', opacity: .92 });
        marker.on('click', () => { setClientPreviewItemId(item.id); setClientMemberId(null); setClientDetailsOpen(false); setClientEventsOpen(false); });
        markersRef.current.set(item.id, marker);
        markerSignaturesRef.current.set(item.id, signature);
      } else if (markerSignaturesRef.current.get(item.id) !== signature) {
        marker.setIcon(createMarkerIcon(item, category, false, iconUrl, true));
        marker.setLatLng(positionToLatLng(item.position, backgroundWidth, backgroundHeight));
        marker.setTooltipContent(createTooltipContent(item.title));
        markerSignaturesRef.current.set(item.id, signature);
      }
      marker.getElement()?.setAttribute('aria-label', item.title);
    }
    for (const [id, marker] of markersRef.current) {
      if (ids.has(id)) continue;
      marker.remove(); markersRef.current.delete(id); markerSignaturesRef.current.delete(id);
    }
  }, [items, categoriesById, hiddenVisitorCategoryIds, getItemIconUrl, backgroundWidth, backgroundHeight]);

  useEffect(() => {
    if (zonesVisible) closePanels();
  }, [zonesVisible]);

  useEffect(() => {
    const map = mapRef.current!;
    const appearance = zoneAppearance(mapSettings.zones);
    const markers = (mapSettings.zones?.labels ?? []).filter(zone => zone.visible && zone.title.trim()).map(zone => {
      const label = document.createElement('span');
      label.className = 'map-zone-label';
      label.textContent = zoneTitle(zone, visitorLocale, defaultLocale);
      Object.assign(label.style, { fontFamily: zoneFontFamily, fontSize: `${appearance.fontSize}px`, fontWeight: String(appearance.fontWeight), textTransform: appearance.uppercase ? 'uppercase' : 'none', color: appearance.textColor, backgroundColor: appearance.backgroundColor, border: appearance.borderWidth ? `${appearance.borderWidth}px solid ${appearance.borderColor}` : 'none', borderRadius: `${appearance.borderRadius}px`, padding: `${appearance.paddingY}px ${appearance.paddingX}px`, maxWidth: `${appearance.maxWidth}px`, cursor: 'pointer' });
      const marker = L.marker(positionToLatLng(zone.position, backgroundWidth, backgroundHeight), {
        icon: L.divIcon({ html: label, className: 'map-zone-anchor', iconSize: [0, 0], iconAnchor: [0, 0] }),
        keyboard: true, title: label.textContent, zIndexOffset: 500, bubblingMouseEvents: false,
        pane: 'visitorZones',
      }).addTo(map);
      marker.getElement()?.setAttribute('aria-label', label.textContent);
      marker.on('click', () => {
        const fit = unconstrainedFitZoom(map, boundsRef.current!, [14, 14]);
        const threshold = fit + Math.log2(mapSettings.zones?.threshold ?? 1);
        const snap = L.Browser.any3d ? map.options.zoomSnap || .25 : 1;
        const iconsZoom = (Math.floor(threshold / snap) + 1) * snap;
        if (map.getMaxZoom() < iconsZoom) map.setMaxZoom(iconsZoom);
        const zoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), fit + 1.35, iconsZoom));
        const limits = navigationLimitPoints(backgroundWidth, backgroundHeight, mapSettings);
        const destination = clampFocusCenter(map, marker.getLatLng(), zoom, L.latLngBounds(limits.southWest, limits.northEast));
        map.flyTo(destination, zoom, { duration: .275, easeLinearity: .25, animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
      });
      return marker;
    });
    return () => { markers.forEach(marker => marker.remove()); };
  }, [mapSettings, visitorLocale, defaultLocale, zoneFontFamily, backgroundWidth, backgroundHeight]);

  useEffect(() => {
    if (!mapSettings.mapOutlineEnabled) return;
    const map = mapRef.current!;
    let cancelled = false;
    let overlay: L.ImageOverlay | undefined;
    let url: string | undefined;
    void createBackgroundOutline(backgroundUrl, mapSettings.mapOutlineWidth, mapSettings.mapOutlineColor).then(result => {
      if (cancelled) return;
      url = URL.createObjectURL(result.blob);
      const dx = backgroundWidth * result.paddingX, dy = backgroundHeight * result.paddingY;
      overlay = L.imageOverlay(url, L.latLngBounds([-dy, -dx], [backgroundHeight + dy, backgroundWidth + dx]), { interactive: false, pane: 'tilePane', zIndex: 0 }).addTo(map);
    }).catch(() => { /* The unfiltered map remains usable. */ });
    return () => { cancelled = true; overlay?.remove(); if (url) URL.revokeObjectURL(url); };
  }, [backgroundUrl, backgroundWidth, backgroundHeight, mapSettings.mapOutlineEnabled, mapSettings.mapOutlineWidth, mapSettings.mapOutlineColor]);

  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') setEventClock(new Date()); };
    const timer = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  const clientGroupRoot = phonePreview
    ? items.find((item) => item.id === clientPreviewItemId) ?? null
    : null;
  const clientGroupEntries = clientGroupRoot ? groupEntries(clientGroupRoot) : [];
  const clientPreviewItem = clientGroupEntries.find((entry) => entry.id === clientMemberId) ?? clientGroupRoot;
  const showGroupPicker = Boolean(clientGroupRoot?.members?.length && !clientGroupEntries.some((entry) => entry.id === clientMemberId));
  const clientPreviewCategory = clientPreviewItem
    ? categoriesById.get(clientPreviewItem.categoryId)
    : undefined;
  const clientPreviewIconUrl = clientPreviewItem
    ? resolveMarkerIconUrl(
        getItemIconUrl?.(clientPreviewItem, clientPreviewCategory),
        clientPreviewCategory?.type ?? clientPreviewItem.type,
      )
    : null;

  useEffect(() => {
    if (!clientPreviewItem || !hiddenVisitorCategoryIds.has(clientPreviewItem.categoryId)) return
    setClientPreviewItemId(null)
    setClientDetailsOpen(false)
  }, [clientPreviewItem, hiddenVisitorCategoryIds])

  const nextEventOccurrence = useMemo(
    () => nextVisibleEventOccurrence(events, eventClock),
    [eventClock, events],
  );

  const focusClientItem = (itemId: string, { suppressCoveredPreview = false, openGroupEntry = false }: { suppressCoveredPreview?: boolean; openGroupEntry?: boolean } = {}) => {
    const item = items.find((candidate) => candidate.id === itemId || candidate.members?.some((member) => member.id === itemId));
    const map = mapRef.current;
    if (!item || !map) return;

    const target = positionToLatLng(
      item.position,
      safeDimension(backgroundWidth),
      safeDimension(backgroundHeight),
    );
    const fitZoom = boundsRef.current ? map.getBoundsZoom(boundsRef.current) : map.getZoom();
    const destinationZoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), fitZoom + 1.35, mapSettings.zones?.enabled ? fitZoom + Math.log2(mapSettings.zones.threshold) + .25 : -Infinity));
    const limits = navigationLimitPoints(
      safeDimension(backgroundWidth),
      safeDimension(backgroundHeight),
      mapSettings,
    );
    const destination = clampFocusCenter(
      map,
      target,
      destinationZoom,
      L.latLngBounds(limits.southWest, limits.northEast),
    );
    const targetScreenPoint = map.project(target, destinationZoom)
      .subtract(map.project(destination, destinationZoom))
      .add(map.getSize().divideBy(2));
    map.flyTo(destination, destinationZoom, { animate: !matchMedia('(prefers-reduced-motion: reduce)').matches, duration: 0.55, easeLinearity: 0.25 });

    setClientEventsOpen(false);
    const choosingGroupEntry = openGroupEntry && Boolean(item.members?.length);
    setClientPreviewItemId(suppressCoveredPreview && !choosingGroupEntry && quickPreviewWouldCoverPoint(targetScreenPoint, map.getSize()) ? null : item.id);
    setClientMemberId(choosingGroupEntry || item.id !== itemId ? itemId : null);
    setClientDetailsOpen(false);
  };

  return (
    <section
      className="map-canvas is-phone-preview visitor-map"
      aria-label={ariaLabel}
      style={{ ...accentVariables(mapSettings.accentColor), backgroundColor, fontFamily }}
    >
      <svg
        className="map-canvas__filter-definitions"
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter
            id="map-canvas-marker-selection-outline"
            x="-25%"
            y="-25%"
            width="150%"
            height="150%"
            colorInterpolationFilters="sRGB"
          >
            <feMorphology
              in="SourceAlpha"
              operator="dilate"
              radius="3"
              result="expanded"
            />
            <feFlood floodColor="#f59e0b" result="outlineColor" />
            <feComposite
              in="outlineColor"
              in2="expanded"
              operator="in"
              result="expandedColor"
            />
            <feComposite
              in="expandedColor"
              in2="SourceAlpha"
              operator="out"
              result="outline"
            />
            <feMerge>
              <feMergeNode in="outline" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {items.map((item) => {
            const effectiveCategory = effectiveMarkerCategory(item, categoriesById.get(item.categoryId))
            if (!effectiveCategory || !categoryOutlineEnabled(effectiveCategory)) return null
            return (
            <filter
              key={item.id}
              id={markerOutlineFilterId(item.id)}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feMorphology
                in="SourceAlpha"
                operator="dilate"
                radius={categoryOutlineWidth(effectiveCategory)}
                result="expanded"
              />
              <feFlood floodColor={categoryOutlineColor(effectiveCategory)} result="outlineColor" />
              <feComposite
                in="outlineColor"
                in2="expanded"
                operator="in"
                result="expandedColor"
              />
              <feComposite
                in="expandedColor"
                in2="SourceAlpha"
                operator="out"
                result="outline"
              />
              <feMerge>
                <feMergeNode in="outline" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            )
          })}
        </defs>
      </svg>

      <div className="map-canvas__viewport-shell" data-testid="map-viewport-shell">
        <div
          ref={containerRef}
          className="map-canvas__leaflet"
          data-testid="map-canvas"
          style={{ backgroundColor }}
        />

        {phonePreview ? (
            <>
            {!clientDetailsOpen && !clientEventsOpen ? (
              <>
                <PhoneMapSearch
                  items={items}
                  categories={categories}
                  locale={visitorLocale}
                  enabledLocales={enabledLocales}
                  languageMenuOpen={languageMenuOpen}
                  hiddenCategoryIds={hiddenVisitorCategoryIds}
                  getLocaleName={localeName}
                  getItemIconUrl={(item, category) => resolveMarkerIconUrl(getItemIconUrl?.(item, category), category?.type ?? item.type)}
                  getCategoryIconUrl={resolveCategoryIconUrl}
                  showCategories={!zonesVisible}
                  onLanguageMenuOpenChange={setLanguageMenuOpen}
                  onChooseLocale={chooseVisitorLocale}
                  onToggleCategory={(categoryId) => setHiddenVisitorCategoryIds((current) => {
                    const next = new Set(current)
                    if (next.has(categoryId)) next.delete(categoryId)
                    else next.add(categoryId)
                    return next
                  })}
                  onChooseItem={(itemId) => focusClientItem(itemId, { suppressCoveredPreview: true, openGroupEntry: true })}
                />
              </>
            ) : null}
            <button
              type="button"
              className={`map-client-events__toggle${clientPreviewItem ? ' is-raised' : ''}`}
              aria-label={visitorLocale === 'de' ? 'Veranstaltungen anzeigen' : clientCopy.events}
              title={nextEventOccurrence ? `${clientCopy.nextEvent}: ${nextEventOccurrence.time}` : clientCopy.programme}
              aria-expanded={clientEventsOpen}
              onClick={() => {
                setClientPreviewItemId(null);
                setClientDetailsOpen(false);
                setClientEventsOpen(true);
              }}
            >
              <CalendarClock size={21} strokeWidth={1.8} aria-hidden="true" />
              {nextEventOccurrence ? (
                <span
                  aria-hidden="true"
                  title={`${nextEventOccurrence.time} · ${nextEventOccurrence.event.title}`}
                >
                  <strong>{nextEventOccurrence.time}</strong>
                  <small>{nextEventOccurrence.event.title}</small>
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={`map-client-location__toggle${clientPreviewItem ? ' is-raised' : ''}`}
              aria-label={clientCopy.myLocation}
              title={clientCopy.myLocation}
              onClick={focusVisitor}
            >
              <LocateFixed size={21} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {compassNotice && <div className="visitor-compass-notice" role="status">{compassNotice}</div>}
          </>
        ) : null}

        {!backgroundUrl ? (
          <div className="map-canvas__empty" role="status">
            <span className="map-canvas__empty-icon" aria-hidden="true">
              <LocateFixed size={22} strokeWidth={1.6} />
            </span>
            <strong>Noch keine Karte geladen</strong>
            <span>Fügen Sie in der Medienverwaltung ein Hintergrundbild hinzu</span>
          </div>
        ) : null}

        {showGroupPicker ? <PhoneGroupPreview
          entries={clientGroupEntries}
          category={clientPreviewCategory}
          getImageUrl={(entry) => getItemImageUrls?.(entry)?.[0] ?? getItemImageUrl?.(entry)}
          onChoose={(id) => { setClientMemberId(id); setClientDetailsOpen(false); }}
          onClose={() => { setClientPreviewItemId(null); setClientMemberId(null); }}
        /> : clientPreviewItem && clientPreviewIconUrl ? (
          <PhoneClientPreview
            key={`${clientPreviewItem.id}:${(clientPreviewItem.imageAssetIds?.length ? clientPreviewItem.imageAssetIds : clientPreviewItem.imageAssetId ? [clientPreviewItem.imageAssetId] : []).join(',')}`}
            item={clientPreviewItem}
            category={clientPreviewCategory}
            imageUrl={getItemImageUrl?.(clientPreviewItem)}
            imageUrls={getItemImageUrls?.(clientPreviewItem)}
            iconUrl={clientPreviewIconUrl}
            expanded={clientDetailsOpen}
            onBackToGroup={clientGroupRoot?.members?.length ? () => { setClientMemberId(null); setClientDetailsOpen(false); } : undefined}
            locale={visitorLocale}
            getFactIconUrl={getFactIconUrl}
            onExpand={() => setClientDetailsOpen(true)}
            onClose={() => {
              setClientPreviewItemId(null)
              setClientDetailsOpen(false)
            }}
          />
        ) : null}

        {phonePreview && clientEventsOpen ? (
          <PhoneEventPanel
            events={events}
            items={items}
            now={eventClock}
            locale={visitorLocale}
            onFocusItem={focusClientItem}
            onClose={() => setClientEventsOpen(false)}
          />
        ) : null}
      </div>

      {!clientDetailsOpen && !clientEventsOpen && <div className="visitor-zoom" role="group" aria-label={visitorLocale === 'de' ? 'Kartenzoom' : 'Map zoom'}>
        <button aria-label={visitorLocale === 'de' ? 'Vergrößern' : 'Zoom in'} onClick={() => mapRef.current?.zoomIn(.5)}><Plus size={19}/></button>
        <button aria-label={visitorLocale === 'de' ? 'Verkleinern' : 'Zoom out'} onClick={() => mapRef.current?.zoomOut(.5)}><Minus size={19}/></button>
      </div>}
    </section>
  );
}

