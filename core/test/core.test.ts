import { describe, expect, it } from "vitest";
import {
  applyIngest,
  categoryOf,
  exitsFor,
  findDuplicates,
  mergeOffers,
  moveOffer,
  stateOf,
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
  it("compte les offres par famille et trie les échéances", async () => {
    const store = new MemoryStore();
    seedDemo(store);
    const home = await buildHome(store);
    expect(home.counts).toEqual({ new: 2, interesting: 1, to_apply: 1, waiting: 1, lead: 2, closed: 1 });
    expect(home.leads.map((l) => l.offer.id).sort()).toEqual(["o-1", "o-2"]);
    expect(home.deadlines.length).toBeGreaterThanOrEqual(3);
    const dates = home.deadlines.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    // Les rencontres réseau sont à part.
    expect(home.deadlines.every((d) => d.kind !== "meeting")).toBe(true);
    expect(home.network.deadlines).toHaveLength(1);
    // Nouvelles offres : la plus récente d'abord, quel que soit le score.
    expect(home.latest.map((l) => l.offer.id)).toEqual(["o-4", "o-3"]);
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

describe("parcours d'une offre", () => {
  it("avance de plusieurs étapes en un clic puis s'arrête là où ça s'est arrêté", async () => {
    const store = new MemoryStore();
    seedDemo(store);
    // Nouvelle → intéressante → à postuler.
    expect((await moveOffer(store, "o-3", { step: "interesting" }))!.state).toEqual({ step: "interesting", exit: null });
    // « J'ai candidaté, j'ai eu un entretien RH… »
    const rh = (await moveOffer(store, "o-3", { step: "screening" }))!;
    expect(rh.offer.status).toBe("applied");
    expect(rh.process!.stage).toBe("screening");
    expect(categoryOf(rh.state)).toBe("lead");
    // « … et j'ai été recalé. »
    const lost = (await moveOffer(store, "o-3", { exit: "lost" }))!;
    expect(lost.state).toEqual({ step: "screening", exit: "lost" });
    expect(lost.offer.status).toBe("closed");
    // Correction : on rouvre en revenant à l'étape.
    expect((await moveOffer(store, "o-3", { step: "screening" }))!.state).toEqual({ step: "screening", exit: null });
    expect((await store.list("processes")).filter((p) => p.offer_id === "o-3")).toHaveLength(1);
  });

  it("lit les anciennes données", () => {
    expect(stateOf({ status: "closed" }, { stage: "lost", outcome: null })).toEqual({ step: "applied", exit: "lost" });
    expect(stateOf({ status: "validated" }, { stage: "to_apply", outcome: null })).toEqual({ step: "to_apply", exit: null });
    expect(stateOf({ status: "rejected" }, null)).toEqual({ step: "new", exit: "rejected" });
    expect(exitsFor("screening").map((e) => e.exit)).toEqual(["lost", "withdrawn"]);
  });
});

describe("doublons", () => {
  it("ignore à l'ingestion une offre au même intitulé dans la même entreprise", async () => {
    const store = new MemoryStore();
    const send = (url: string, title: string) =>
      applyIngest(store, { source: "linkedin", offers: [{ title, company: "Datadog", url }] });
    await send("https://www.linkedin.com/jobs/view/4300000001", "Senior Product Manager - APM (H/F)");
    const again = await send("https://careers.datadoghq.com/detail/123", "Senior Product Manager – APM");
    expect(again.created).toHaveLength(0);
    expect(await store.list("offers")).toHaveLength(1);
    // Un autre poste dans la même entreprise reste distinct.
    expect((await send("https://www.linkedin.com/jobs/view/4300000002", "Product Manager Logs")).created).toHaveLength(1);
  });

  it("fusionne deux offres en gardant le parcours le plus avancé", async () => {
    const store = new MemoryStore();
    seedDemo(store);
    // Doublon arrivé plus tard, déjà en entretiens.
    await store.update("offers", "o-4", { title: "Head of Data & IA", url: "https://exemple-energie.test/jobs/1" });
    expect((await findDuplicates(store)).map((g) => g.map((o) => o.id).sort())).toEqual([["o-1", "o-4"]]);
    const merged = (await mergeOffers(store, "o-4", "o-1"))!;
    expect(merged.status).toBe("applied");
    expect(await store.get("offers", "o-1")).toBeNull();
    const proc = (await store.list("processes")).find((p) => p.offer_id === "o-4")!;
    expect(proc.stage).toBe("interviews");
    expect((await store.list("interviews")).filter((i) => i.process_id === proc.id)).toHaveLength(2);
  });
});
