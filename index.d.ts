export type Unit = 'codepoints' | 'graphemes' | 'utf8-bytes' | 'utf16' | 'x-weighted' | 'threads';
export type AdRule = 'plain' | 'wide' | 'wide+emoji';

export interface TextLimit {
  id: string; platform: string; field: string; kind: 'body' | 'title' | 'tags';
  max: number; unit: Unit; source: string | null; notes?: string;
  extended?: { max: number; when: string };
  maxBytes?: number; maxHashtags?: number; maxMentions?: number; maxLinks?: number;
}
export interface AdField { id: string; name: string; max?: number; recommended?: number; rule: AdRule; count?: [number, number]; linkLength?: number; source?: string }
export interface AdPlatform { id: string; name: string; source: string; notes?: string; fields: AdField[] }
export interface Placement {
  id: string; platform: string; name: string; media: ('image' | 'video')[];
  export: { width: number; height: number };
  aspect?: { recommended: string; min: number; max: number; outside: 'crop' | 'refuse' | 'letterbox' };
  shapes?: { ratio: string; minWidth: number; minHeight: number }[]; shapesAreRecommendations?: boolean;
  minWidth?: number; minHeight?: number; minShortSide?: number; maxLongSide?: number; minFps?: number;
  maxImageBytes?: number; maxVideoBytes?: number; maxGifBytes?: number;
  minDurationSeconds?: number; maxDurationSeconds?: number; formats?: string[];
  safeZone?: string; notes?: string; source: string;
}
export interface SafeZone {
  id: string; name: string; frame: { width: number; height: number };
  blocked?: { label: string; box: [number, number, number, number] }[];
  safe?: { label: string; box: [number, number, number, number] };
  method: string; source?: string;
}

export const textLimits: { about: string; checked: string; units: Record<Unit, string>; kinds: Record<string, string>; limits: TextLimit[] };
export const adCopy: { about: string; checked: string; rules: Record<AdRule, string>; platforms: AdPlatform[] };
export const placements: { about: string; checked: string; placements: Placement[] };
export const safeZones: { about: string; checked: string; zones: SafeZone[] };

export interface Problem { code: string; message: string }
export interface TextResult { id: string; platform: string; field: string; ok: boolean; count: number; max: number; unit: Unit; remaining: number; problems: Problem[] }
export interface AdResult { platform: string; field: string; name: string; ok: boolean; status: 'ok' | 'may-truncate' | 'over'; count: number; max: number | null; recommended: number | null; rule: AdRule; source: string }
export interface Crop { x: number; y: number; width: number; height: number; lost: number }
export interface MediaIssue { level: 'error' | 'warning'; code: string; message: string }
export interface MediaResult { ok: boolean; placement: string; name: string; issues: MediaIssue[]; export: { width: number; height: number }; crop: Crop | null; source: string }

export function countText(text: string, unit?: Unit | AdRule, opts?: { linkLength?: number }): number;
export function countTags(text: string): { hashtags: number; mentions: number; links: number };
export function findLinks(text: string): string[];
export function graphemes(text: string): string[];
export function isEmoji(grapheme: string): boolean;
export function isWide(grapheme: string): boolean;
export function utf8Bytes(text: string): number;

export function getTextLimit(id: string): TextLimit;
export function getPlacement(id: string): Placement;
export function getSafeZone(id: string): SafeZone;
export function getAdPlatform(id: string): AdPlatform;

export function checkText(id: string, text: string, opts?: { premium?: boolean }): TextResult;
export function checkEverywhere(text: string, opts?: { premium?: boolean; kinds?: ('body' | 'title' | 'tags')[] }): TextResult[];
export function checkAdCopy(platformId: string, fieldId: string, text: string): AdResult;
export function checkMedia(id: string, media: { width: number; height: number; type?: 'image' | 'video'; bytes?: number; durationSeconds?: number }): MediaResult;
export function centerCrop(width: number, height: number, ratio: string | number): Crop;
export function parseRatio(ratio: string | number): number;
