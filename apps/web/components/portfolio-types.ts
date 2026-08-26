/** Shapes returned by `/api/portfolio`. The client renders only from these. */

export interface PortfolioProject {
  id: string;
  name: string;
  summary: string;
  problem: string | null;
  company: string | null;
  industries: string[];
  tools: string[];
  skills: Array<{ id: string; name: string }>;
  responsibilities: string[];
  outcomes: string[];
  process: Array<{ step: number; title: string; description: string }>;
  transformation: Array<{ name: string; caption: string; detail: string }>;
  shortPitch: string;
  followups: string[];
  verified: boolean;
  openQuestions: string[];
  media: Array<{ type: string; uri: string; caption?: string }>;
  sources: Array<{ name: string; authority: number }>;
}

export interface PortfolioSkill {
  id: string;
  name: string;
  category: string;
  proficiency: string | null;
  verified: boolean;
  projects: Array<{ id: string; name: string }>;
}

export interface TimelineEntry {
  id: string;
  claim: string;
  from: string | null;
  to: string | null;
  ongoing: boolean;
  verified: boolean;
}

export interface CVData {
  summary: string[];
  experience: string[];
  education: string[];
  skills: string[];
  languages: string[];
  full: string[];
}

export interface Portfolio {
  projects: PortfolioProject[];
  skills: PortfolioSkill[];
  timeline: TimelineEntry[];
  cv: CVData;
}
