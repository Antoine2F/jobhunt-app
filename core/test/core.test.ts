import { describe, expect, it } from "vitest";
import {
  applyIngest,
  buildHome,
  MemoryStore,
  offerKey,
  parseConcept,
  seedDemo,
  suggestForOffer,
  validate,
  ValidationError,
} from "../src/index.js";

describe("offerKey", () => {
  it("unifie les URL LinkedIn quel que soit le suivi", () => {
    expect(offerKey("https://www.linkedin.com/comm/jobs/view/3912345678/?trackingId=abc&refId=x")).toBe("linkedin:3912345678");
    expect(offerKey("https://fr.linkedin.com/jobs/view/head-of-data-at-acme-3912345678")).toBe("linkedin:3912345678");
    expect(offerKey("https://www.linkedin.com/jobs/search/?currentJobId=3912345678&geoId=1")).toBe("linkedin:3912345678");
  });
  it("reconnaît les offres WTTJ", () => {
    expect(offerKey("https://www.welcometothejungle.com/fr/companies/acme/jobs/head-of-data_paris?utm_source=alert")).toBe(
      "wttj:acme/head-of-data_paris",
    );
  });
  it("retire les paramètres de suivi des autres sites", () => {
    expect(offerKey("https://jobs.example.com/offre/42/?utm_source=x&id=7")).toBe("jobs.example.com/offre/42?id=7");
  });
  it("renvoie null sur une URL invalide", () => {
    expect(offerKey("pas une url")).toBeNull();
  });
});

describe("validate", () => {
  it("rejette un statut inconnu", () => {
    expect(() => validate("offers", { title: "x", status: "bidon" })).toThrow(ValidationError);
  });
  it("ignore les colonnes inconnues et exige les champs obligatoires", () => {
    expect(validate("companies", { name: "A", hack: "1" })).toEqual({ name: "A" });
    expect(() => validate("companies", {})).toThrow(ValidationError);
    expect(validate("companies", {}, { partial: true })).toEqual({});
  });
});

describe("applyIngest", () => {
  it("déduplique les offres et réutilise l'entreprise existante", async () => {
    const store = new MemoryStore();
    const payload = {
      source: "linkedin" as const,
      message_id: "msg-1",
      offers: [
        { title: "Head of Data", company: "ACME SAS", url: "https://www.linkedin.com/jobs/view/1234567/?trk=a" },
        { title: "Head of Data", company: "Acme", url: "https://linkedin.com/jobs/view/1234567?trk=b" },
        { title: "CDO", company: "Acme" },
      ],
    };
    const res = await applyIngest(store, payload);
    expect(res.created).toHaveLength(2);
    expect(res.duplicates).toBe(1);
    expect(await store.list("companies")).toHaveLength(1);
    expect(res.created.every((o) => o.status === "proposed")).toBe(true);

    const again = await applyIngest(store, { ...payload, message_id: "msg-2" });
    expect(again.created).toHaveLength(0);
    expect(again.duplicates).toBe(3);
  });
});

describe("buildHome", () => {
  it("liste les processus actifs et les échéances triées", async () => {
    const store = new MemoryStore();
    seedDemo(store);
    const home = await buildHome(store);
    expect(home.counts.active_processes).toBe(2);
    expect(home.counts.proposed).toBe(2);
    expect(home.deadlines.length).toBeGreaterThanOrEqual(3);
    const dates = home.deadlines.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(home.to_review[0].score).toBe(79);
  });
});

describe("suggestForOffer", () => {
  it("propose l'insider en premier, puis la personne qui l'a présenté", async () => {
    const store = new MemoryStore();
    seedDemo(store);
    const res = await suggestForOffer(store, "o-4");
    expect(res?.company?.name).toBe("Exemple Énergie");
    expect(res?.suggestions[0].person.name).toBe("Camille Exemple");
    expect(res?.suggestions.map((s) => s.person.name)).toContain("Dominique Test");
    expect(res?.linkedin_search_url).toContain("linkedin.com/search/results/people");
  });
  it("trouve les anciens de l'entreprise", async () => {
    const store = new MemoryStore();
    seedDemo(store);
    const res = await suggestForOffer(store, "o-2");
    expect(res?.suggestions[0].person.name).toBe("Alex Démo");
    expect(res?.suggestions[0].reasons[0]).toMatch(/A travaillé chez/);
  });
});

describe("knowledge", () => {
  it("lit le frontmatter OKF", () => {
    const c = parseConcept("profil/skills.md", "---\ntype: Skill Inventory\ntitle: Compétences\ntags: [data]\n---\n# Corps\n");
    expect(c.meta.type).toBe("Skill Inventory");
    expect(c.meta.tags).toEqual(["data"]);
    expect(c.body.trim()).toBe("# Corps");
  });
});
