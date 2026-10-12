import { describe, expect, it } from "vitest";
import config from "../sources.json";
import { ruleFor, type SenderRule } from "../src/mail.js";

describe("ruleFor", () => {
  const rules = config.senders as SenderRule[];
  it("associe chaque expéditeur à sa source", () => {
    expect(ruleFor("JobAlerts-noreply@linkedin.com", rules)?.source).toBe("linkedin");
    expect(ruleFor("alerts@mail.welcometothejungle.com", rules)?.source).toBe("wttj");
    expect(ruleFor("offres@michaelpage.fr", rules)?.source).toBe("cabinet");
    expect(ruleFor("ami@gmail.com", rules)).toBeNull();
  });
});
