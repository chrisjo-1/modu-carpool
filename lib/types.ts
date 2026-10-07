export type Post = {
  id: string;
  owner: string;
  ownerBio: string;
  role: "driver" | "rider";
  kind: "commute" | "trip";
  cost: "free" | "meter";
  origin: string;
  dest: string;
  departAt: number;
  seats: number;
  note: string;
  status: "open" | "closed";
  mine: boolean;
};

export type Thread = {
  id: string;
  postId: string;
  origin: string;
  dest: string;
  departAt: number;
  cost: "free" | "meter";
  status: "pending" | "accepted" | "declined";
  message: string;
  iAmOwner: boolean;
  other: string;
  otherBio: string;
  contact: string | null;
};

export type User = { id: string; email: string; name: string; bio: string; contact: string };

export const METER_URL = process.env.NEXT_PUBLIC_METER_URL || "https://moca-meter.vercel.app";
