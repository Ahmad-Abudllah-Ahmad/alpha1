import type { AnalysisResult, ClaimType } from "./types";

const CLAIM_HEADINGS: Record<ClaimType, string> = {
  contract: "CONTRACT / SUBCONTRACT DRAFT",
  eot: "EXTENSION OF TIME (EOT) CLAIM NOTICE",
  notice: "CONTRACTOR'S NOTICE OF CLAIM",
  mitigation: "MITIGATION NOTICE & COST IMPACT STATEMENT",
};

function today(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function riskSection(analysis: AnalysisResult): string {
  if (!analysis.risks.length) return "(No specific risks were flagged in the contract analysis.)";
  return analysis.risks
    .map(
      (r) =>
        `${r.id}. [${r.severity.toUpperCase()}] ${r.title}\n` +
        `   UAE Law: ${r.uaeLaw || "—"}\n` +
        `   Analysis: ${r.analysis}\n` +
        `   Recommended action: ${r.action || "—"}`
    )
    .join("\n\n");
}

export function buildLocalDraft(
  filename: string,
  claimType: ClaimType,
  analysis: AnalysisResult,
  notes?: string
): string {
  const heading = CLAIM_HEADINGS[claimType];
  const risks = riskSection(analysis);
  const userNotes = notes?.trim() ? `\n\nUSER REQUIREMENTS:\n${notes.trim()}` : "";

  if (claimType === "contract") {
    return `${heading}
Reference: ${filename}
Date: ${today()}
Prepared by: ADICC Contracts — aligned with UAE laws & ADICC policy knowledge base

PARTIES
[EMPLOYER NAME], a company incorporated in the United Arab Emirates ("Employer")
[CONTRACTOR NAME], a company incorporated in the United Arab Emirates ("Contractor")

1. SCOPE OF WORK
The Contractor shall design, supply, install, test, and commission the works described in
Schedule 1 (Scope of Works) for the project known as [PROJECT NAME] in [EMIRATE], UAE.${userNotes}

2. CONTRACT SUM & PAYMENT
2.1 The Contract Sum is AED [CONTRACT SUM] (exclusive of VAT).
2.2 Payment shall be made monthly against certified interim payment certificates.
2.3 Retention of [X]% shall apply until Practical Completion.

3. TIME FOR COMPLETION
3.1 The Time for Completion is [COMPLETION DATE].
3.2 Extension of Time shall be granted only in accordance with Clause 8.4 and UAE Federal
    Decree-Law No. 11 of 2023 (as applicable).

4. VARIATIONS
Variations shall be instructed in writing. No work shall proceed without a signed variation order.

5. DELAY, EOT & LIQUIDATED DAMAGES
5.1 The Contractor shall give notice of any delaying event within [14] days of becoming aware.
5.2 Liquidated damages shall not exceed [X]% of the Contract Sum, consistent with UAE law.
5.3 The following risks identified in the reference contract shall be expressly addressed:
${risks}

6. TERMINATION
Termination for default shall follow UAE law and require [30] days' cure notice where applicable.

7. DISPUTE RESOLUTION
Disputes unresolved after [28] days of negotiation shall be referred to DIAC arbitration seated in Dubai, UAE.

8. GOVERNING LAW
This Contract is governed by the laws of the United Arab Emirates.

9. INSURANCE
The Contractor shall maintain works insurance, third-party liability, and professional indemnity as per ADICC policy.

IN WITNESS WHEREOF the Parties execute this Contract on the date first written above.

________________________          ________________________
For and on behalf of Employer     For and on behalf of Contractor

AI SUMMARY (reference analysis):
${analysis.summary || "(none)"}`;
  }

  if (claimType === "eot") {
    return `${heading}
To:     [EMPLOYER / ENGINEER NAME]
From:   [CONTRACTOR NAME]
Project: [PROJECT NAME]
Contract: ${filename}
Date:   ${today()}

Dear Sir/Madam,

NOTICE OF CLAIM — EXTENSION OF TIME

1. EVENT
We hereby give formal notice pursuant to the Contract that the Contractor has encountered
a delaying event as described below:
[DESCRIBE EVENT — e.g. unforeseen ground conditions encountered on [DATE] at [LOCATION]]${userNotes}

2. CONTRACTUAL BASIS
This notice is issued under the notice-of-claim provisions of the Contract and is supported
by the following grounds identified in our contract review:

${risks}

3. TIME IMPACT
The event is anticipated to delay completion by [NUMBER] days. A detailed programme revision
and supporting records will follow within [14] days.

4. RESERVATION OF RIGHTS
The Contractor reserves all rights to an extension of time and any associated cost entitlement
under the Contract and applicable UAE law.

Yours faithfully,

[AUTHORISED SIGNATORY]
[CONTRACTOR NAME]`;
  }

  if (claimType === "mitigation") {
    return `${heading}
To:     [EMPLOYER / ENGINEER NAME]
From:   [CONTRACTOR NAME]
Project: [PROJECT NAME]
Contract: ${filename}
Date:   ${today()}

MITIGATION MEASURES & COST IMPACT

1. BACKGROUND
Following the event notified on [DATE], the Contractor has implemented mitigation measures
to minimise delay and cost exposure.${userNotes}

2. MITIGATION ACTIONS TAKEN
• [Action 1 — e.g. redeployed crew to parallel work front]
• [Action 2 — e.g. accelerated procurement of long-lead items]
• [Action 3 — e.g. revised sequencing of critical-path activities]

3. COST IMPACT (ESTIMATE)
Additional cost incurred to date: AED [AMOUNT]
Further anticipated cost: AED [AMOUNT]

4. CONTRACTUAL GROUNDS
${risks}

5. SUPPORTING DOCUMENTATION
Detailed cost breakdown and daily records are available on request.

Yours faithfully,

[AUTHORISED SIGNATORY]`;
  }

  return `${heading}
To:     [EMPLOYER / ENGINEER NAME]
From:   [CONTRACTOR NAME]
Project: [PROJECT NAME]
Contract: ${filename}
Date:   ${today()}

NOTICE OF CLAIM

1. EVENT
The Contractor hereby gives notice of a claim event arising under the Contract:
[DESCRIBE EVENT AND DATE]${userNotes}

2. GROUNDS
${risks}

3. RELIEF SOUGHT
The Contractor seeks [extension of time / additional payment / both] in accordance with
the Contract and UAE law.

4. PRESERVATION OF RIGHTS
All contractual and legal rights are expressly reserved.

Yours faithfully,

[AUTHORISED SIGNATORY]`;
}
