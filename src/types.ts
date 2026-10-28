export type Category = "travel" | "food" | "experience" | "sports" | "accomplishment" | "property";
export type Precision = "day" | "month" | "season" | "year";

export interface Person {
  id: string;
  name: string;
  initial: string;
  kind: "person" | "pet";
}

export interface MemorySummary {
  id: string;
  place_id: string;
  title: string;
  category: Category;
  date_start: string;
  date_precision: Precision;
  date_end: string | null;
  ongoing: number;
  repeats: number;
  created_by: string;
  people: string[];
  photos: number;
  voices: number;
  thoughts: number;
  created_at: string;
  cover: string | null; // first photo, for the list view
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  memories: MemorySummary[];
}

export interface World {
  people: Person[];
  places: Place[];
}

export interface Media {
  id: string;
  kind: "photo" | "voice";
  content_type: string;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  added_by: string;
  added_at: string;
  has_thumb: number;
  thought_id?: string | null;
}

export interface Thought {
  id: string;
  author: string;
  text: string;
  created_at: string;
  updated_at: string;
  voice: Media | null;
}

export interface MemoryDetail {
  id: string;
  place_id: string;
  place: { id: string; name: string; lat: number; lng: number };
  title: string;
  category: Category;
  date_start: string;
  date_precision: Precision;
  date_end: string | null;
  ongoing: number;
  repeats: number;
  story: string;
  created_by: string;
  created_at: string;
  people: string[];
  media: Media[];
  thoughts: Thought[];
}

export interface MemoryInput {
  place: { id: string } | { name: string; lat: number; lng: number };
  title: string;
  category: Category;
  date_start: string;
  date_precision: Precision;
  date_end?: string | null;
  ongoing?: boolean;
  repeats?: boolean;
  story: string;
  people: string[];
  posted_by?: string;
}

export const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: "travel", label: "Travel", color: "#D9612B" },
  { id: "food", label: "Food", color: "#C9A227" },
  { id: "experience", label: "Experiences", color: "#2F7D6D" },
  { id: "sports", label: "Sports", color: "#3553A0" },
  { id: "accomplishment", label: "Accomplishments", color: "#8C3B5E" },
  { id: "property", label: "Places", color: "#6B6259" }, // id stays "property" (DB check constraint); only the label changed
];

export const categoryColor = (c: Category) => CATEGORIES.find((x) => x.id === c)?.color ?? "#6B6259";
export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c;
