import type { LucideIcon } from "lucide-react";
import {
  Bike,
  Building2,
  Gift,
  Handshake,
  Landmark,
  Megaphone,
  Package,
  Route,
  Search,
  User,
} from "lucide-react";
import type { SearchEntityIconKey } from "@/lib/search/types";

export const SEARCH_ENTITY_ICONS: Record<SearchEntityIconKey, LucideIcon> = {
  user: User,
  megaphone: Megaphone,
  bike: Bike,
  building: Building2,
  handshake: Handshake,
  landmark: Landmark,
  gift: Gift,
  route: Route,
  package: Package,
  search: Search,
};
