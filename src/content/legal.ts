// The words of the Privacy Policy, Terms of Use and About page.
// Written in plain language. DRAFTS: have a Nigerian lawyer review the Privacy Policy and Terms before launch.
// Numbers that appear in the text (hours, minutes) come from config/app.config.ts so the words never drift
// away from what the app really does.
import { appConfig } from "../../config/app.config";

export interface Block {
  id: string;
  heading: string;
  /** Plain paragraphs. A line starting with "- " becomes a bullet. */
  text: string[];
}
export interface Doc {
  title: string;
  description: string;
  summaryEn?: string[];
  summaryPcm?: string[];
  blocks: Block[];
}

const L = appConfig.legal;
const S = appConfig.status;
const TURNSTILE = "https://www.cloudflare.com/turnstile-privacy-policy/";
const CLOUDFLARE = "https://www.cloudflare.com/privacypolicy/";

export const LINKS = { turnstile: TURNSTILE, cloudflare: CLOUDFLARE, ndpc: "https://ndpc.gov.ng" };

// ============================================================================ PRIVACY POLICY
export const privacy: Doc = {
  title: "Privacy Policy",
  description: "What Light Dey? collects, why, who sees it, and how you can see, download or delete your data.",
  summaryEn: [
    "No names, no phone numbers, no exact location. You can use the app without giving us any of them.",
    "We store what you report (which spot, what the light was doing, when) and a few scrambled signals to stop spam.",
    "Nobody can see who made a report. Other people only ever see totals and \"someone reported\".",
    "You can download or delete your data yourself, any time, on the My data page.",
  ],
  summaryPcm: [
    "No name, no phone number, no exact location. You fit use the app without any of dem.",
    "We dey keep wetin you report (which spot, wetin light dey do, which time) and small scrambled signals to stop spam.",
    "Nobody fit see who make report. People go only see total and \"somebody report\".",
    "You fit download or delete your data yourself, any time, for the My data page.",
  ],
  blocks: [
    {
      id: "who",
      heading: "1. Who we are",
      text: [
        `Light Dey? is run by ${L.operatorName} ("we", "us"). We are the controller of the personal data described here under the Nigeria Data Protection Act 2023.`,
        `Contact us at ${L.contactEmail}, or write to ${L.address}.`,
        "Light Dey? is an independent, crowdsourced service. We are not part of NERC, any electricity distribution company (DisCo), or the government.",
      ],
    },
    {
      id: "collect",
      heading: "2. What we collect, and why",
      text: [
        "We collect as little as we can. Here is everything, in plain words:",
        "- **A private account number.** The first time you open the app we create an account for you with no name, email or phone number. It lets us keep your points, streak and saved spots. We also give you a friendly automatic nickname (for example \"Neighbour-a1b2c3\").",
        "- **Your settings.** Language, light or dark theme, and the spots you save (for example Home or Office).",
        "- **Your reports.** For each report: which spot, whether the light was on, off or weak, and the time. We use reports to show the live status of a spot and to work out hours of supply per day and per week.",
        "- **Spots and details you add.** If you add a street or estate, or tell us a spot's DisCo or tariff band, we keep that and who added it, so our team can check it.",
        "- **Points, streaks and a trust score.** Points and streaks reward reporting. The trust score is a private number we use to decide how much weight a report carries, and to give less weight to activity that looks like abuse. It is never shown to anyone.",
        "- **Spam and abuse signals.** A random device code made on your phone, and your internet address (IP address). We store only scrambled versions (a one-way hash) of these, never the originals, and use them only to limit how often one phone or connection can report and to spot abuse.",
        "- **Emails of administrators.** Only the small team who run Light Dey? sign in with an email address. Ordinary users do not give us an email.",
        "We do not ask for your real name, phone number, home address, contacts or photos.",
      ],
    },
    {
      id: "location",
      heading: "3. Your location",
      text: [
        "Allowing location is optional. If you tap \"Use my location\", your phone works out your position and the app uses it, on your phone, to suggest nearby areas. We never receive, store or share your position. If you say no, you can search for your area instead.",
      ],
    },
    {
      id: "device",
      heading: "4. Things saved on your phone",
      text: [
        "The app saves a few things in your phone's browser storage so it works quickly and without network: your settings, your saved spots, the last status we showed you, reports waiting to be sent when the network returns, a random device code, and your sign-in session. We do not use this storage for advertising.",
        "At the moment we do not use advertising or analytics trackers. If that changes we will update this page and ask you first where the law requires it.",
        "You can clear this storage at any time in your browser settings, or delete everything on the My data page.",
      ],
    },
    {
      id: "turnstile",
      heading: "5. Protection against bots (Cloudflare Turnstile)",
      text: [
        "To stop automated programs from flooding the app with fake reports, we use Cloudflare Turnstile, a service of Cloudflare, Inc. It runs a quick check in the background (you usually will not see anything) when you send a report or sign in.",
        "As described in the Cloudflare Turnstile Privacy Addendum, Turnstile looks at signals such as your IP address, TLS fingerprint, browser type (User-Agent) and our website's site key, and runs checks in your browser to tell people from bots. We receive only a pass or fail answer.",
        `Please read the Turnstile Privacy Addendum: ${TURNSTILE} and Cloudflare's Privacy Policy: ${CLOUDFLARE}.`,
      ],
    },
    {
      id: "share",
      heading: "6. Who we share data with",
      text: [
        "We do not sell your data and we do not share it for advertising. We use a few companies to run Light Dey?. They process data only to provide their service to us:",
        "- **Supabase** (database and accounts), servers in the United Kingdom.",
        "- **Vercel** (hosting the website and app). Like most hosts, it keeps technical logs, including IP addresses, for a short time.",
        "- **Cloudflare** (bot protection, described above).",
        "We may also share information if the law or a court requires it, or to protect people from serious harm or abuse.",
        "Anything we publish (for example hours of light per week for an area, or leaderboards) is combined from many people's reports and cannot be traced to you.",
      ],
    },
    {
      id: "others",
      heading: "7. What other people can see",
      text: [
        "Nobody can see who made a report. Other people see a spot's status, how long it has lasted, and things like \"Someone in Wuye reported light 4 minutes ago\". On the Board (top reporters), only your automatic nickname appears, never a real name or phone number.",
      ],
    },
    {
      id: "abroad",
      heading: "8. Data leaving Nigeria",
      text: [
        "Our service providers store and process data outside Nigeria (for example the United Kingdom and the United States). We choose providers that protect data with security measures and contractual commitments, and we share only what is needed.",
      ],
    },
    {
      id: "keep",
      heading: "9. How long we keep it",
      text: [
        "- Your account data (settings, saved spots, points, streak): until you delete your account.",
        "- Reports: kept to produce statistics about electricity supply. If you delete your account, your reports stay in the statistics but are no longer connected to you, and the scrambled network code on them is removed.",
        "- Short-lived spam-control records (counts of recent reports from a phone or connection): cleared automatically within about a day.",
        "- Administrator actions are logged for security and accountability.",
      ],
    },
    {
      id: "rights",
      heading: "10. Your rights",
      text: [
        "Under the Nigeria Data Protection Act 2023 you have rights over your personal data, including the right to be informed, to access it, to correct it, to have it deleted, to restrict or object to how it is used, to withdraw consent, and to receive a copy you can move elsewhere.",
        "- **Download your data and delete your account yourself** on the My data page (/my-data). It takes a few seconds and needs no email.",
        `- For anything else, write to ${L.contactEmail}. We aim to reply within 30 days.`,
        `- You may also complain to the Nigeria Data Protection Commission (NDPC): ${LINKS.ndpc}.`,
        "You can use the app without agreeing to optional things like location. If you withdraw consent, you can stop using the app and delete your data at any time.",
      ],
    },
    {
      id: "children",
      heading: "11. Children",
      text: [
        "Light Dey? is for people aged 18 and over. If you are under 18 you may use it only with the permission of a parent or guardian, who should read this policy with you. If we learn that we hold a child's data without that permission, we will delete it.",
      ],
    },
    {
      id: "security",
      heading: "12. Keeping data safe",
      text: [
        "Data travels over encrypted connections. Access to personal data is limited, and administrator actions are checked and recorded. No system is perfectly secure. If a breach seriously affects your rights, we will tell you and the NDPC as the law requires.",
      ],
    },
    {
      id: "changes",
      heading: "13. Changes to this policy",
      text: [
        `This is version ${L.version}, effective ${L.effectiveDate}. If we make important changes we will tell you in the app and, where needed, ask you to agree again.`,
      ],
    },
  ],
};

// ============================================================================ TERMS OF USE
export const terms: Doc = {
  title: "Terms of Use",
  description: "The rules for using Light Dey?, written in plain language.",
  summaryEn: [
    "Light Dey? is built by neighbours, for neighbours. Report honestly and be kind.",
    "It is crowdsourced and can be wrong. Do not rely on it for anything where safety or money is at stake.",
    "We are independent: not NERC, not any DisCo, not the government.",
    "We can remove fake reports and stop people who abuse the app.",
  ],
  summaryPcm: [
    "Light Dey? na neighbours build am for neighbours. Report true true and respect people.",
    "Na crowd dey report, so e fit wrong. No use am for anything wey safety or money dey involved.",
    "We dey stand alone: we no be NERC, we no be any DisCo, we no be government.",
    "We fit remove fake reports and stop anybody wey dey abuse the app.",
  ],
  blocks: [
    {
      id: "service",
      heading: "1. What Light Dey? is",
      text: [
        `Light Dey? ("the service") lets people report whether there is electricity in their area and shows what neighbours have reported. It is provided by ${L.operatorName}.`,
        "We are an independent, crowdsourced service. We are not affiliated with, endorsed by, or acting for NERC, any electricity distribution company (DisCo), or any government body.",
      ],
    },
    {
      id: "accuracy",
      heading: "2. It can be wrong",
      text: [
        "Everything on Light Dey? comes from reports by ordinary people. Reports can be mistaken, late, or missing, and some areas have very few reports. Statuses, hours of supply, comparisons with tariff bands and rankings are estimates and a guide, not an official record, a measurement, or a guarantee.",
        "Do not rely on the service for anything where safety, health, a legal matter, or a financial decision depends on it. For example, do not use it to decide whether medical equipment will have power.",
        "When we compare areas or DisCos, we only show what the combined reports say, and only when there is enough data to be fair. These comparisons are not statements of fact about any company.",
      ],
    },
    {
      id: "who",
      heading: "3. Who can use it",
      text: [
        "You must be 18 or older, or have permission from a parent or guardian. You are responsible for what you do with the service.",
      ],
    },
    {
      id: "reports",
      heading: "4. Your reports and spots",
      text: [
        "Please report only what you honestly believe is true for the place you chose. Do not:",
        "- send false or deliberately misleading reports, or report for places you are not near, to push a statistic one way or another;",
        "- use scripts, bots or several accounts or phones to send more reports than a normal person would, or to get around our limits and checks;",
        "- add spots or details that are offensive, misleading or not real, or that identify a private person;",
        "- try to break, overload, probe or copy the service, or get into data that is not yours.",
        `Reports from one person at one spot are limited (currently one every ${appConfig.reportCooldownMinutes} minutes) to protect the quality of the data.`,
      ],
    },
    {
      id: "licence",
      heading: "5. How we may use your reports",
      text: [
        "You keep ownership of anything you contribute. You give us a free, worldwide permission to use your reports and the spots and details you add to run the service, to produce statistics, shareable images and public pages, and to share anonymised, combined information with the public, researchers and journalists. We will not publish your personal data.",
      ],
    },
    {
      id: "rewards",
      heading: "6. Points, streaks and badges",
      text: [
        "Points, streaks and badges are for fun and to encourage reporting. They have no cash value, can be changed or reset, and may be removed if they were earned through abuse. If we ever offer rewards such as airtime or data, separate rules will apply and will be shown clearly.",
      ],
    },
    {
      id: "action",
      heading: "7. What we may do",
      text: [
        "To keep the service fair and useful, we may remove reports, spots or details, give less weight to certain reports, limit or ban accounts, and change, pause or end any part of the service. We try to be fair and to act on evidence, and we keep a record of admin actions.",
      ],
    },
    {
      id: "liability",
      heading: "8. Our responsibility",
      text: [
        "We work hard to keep Light Dey? running and useful, but we provide it \"as it is\" and \"as available\". To the fullest extent the law of Nigeria allows, we are not liable for losses that come from relying on the service, from outages or errors, or from the actions of other users or third parties. Nothing in these terms limits any right you have that cannot be limited by law.",
      ],
    },
    {
      id: "other",
      heading: "9. Other services",
      text: [
        "Light Dey? uses services from other companies (for example hosting and bot protection). Their own terms apply to their services.",
      ],
    },
    {
      id: "leave",
      heading: "10. Leaving",
      text: [
        "You can stop using Light Dey? at any time and delete your account and data on the My data page (/my-data). Our Privacy Policy explains what happens to your data.",
      ],
    },
    {
      id: "law",
      heading: "11. Law and changes",
      text: [
        `These terms are governed by the laws of the Federal Republic of Nigeria, and disputes will be handled by the courts in ${L.governingCity}.`,
        `This is version ${L.version}, effective ${L.effectiveDate}. If we make important changes we will tell you in the app. Questions: ${L.contactEmail}.`,
      ],
    },
  ],
};

// ============================================================================ ABOUT / HOW IT WORKS
export const about: Doc = {
  title: "How Light Dey? works",
  description: "How neighbours' reports become live status, hours of light, and a check against tariff bands.",
  summaryEn: [
    "Light Dey? is a map of electricity made by neighbours. One tap tells everyone if light dey or not.",
  ],
  summaryPcm: [
    "Light Dey? na map of light wey neighbours dey make. One tap go tell everybody if light dey or no dey.",
  ],
  blocks: [
    {
      id: "why",
      heading: "Why it exists",
      text: [
        "In Nigeria, light comes and goes, and nobody has street-level facts about when, or for how long. Since 2024, tariff bands promise customers a minimum number of hours of supply each day: Band A the most, and Band E the least. Many customers believe they do not get what they pay for, but have no evidence. Light Dey? gives neighbours a way to build that evidence together.",
      ],
    },
    {
      id: "how",
      heading: "How a status is worked out",
      text: [
        "Anyone can tap \"Light dey\", \"No light\" or \"Light dey but e weak\" for their spot. Then:",
        `- **Recent reports count more.** A report matters half as much after every ${S.recencyHalfLifeMinutes} minutes. Reports older than ${S.windowHours} hours stop voting.`,
        "- **Trust matters.** Each person has a private trust score. Everyone starts equal, and our team can lower it for activity that looks like abuse. In future it will also adjust automatically, rising when someone's reports match what neighbours say.",
        "- **One person cannot flip a busy spot.** Busy spots need real agreement to change. Quiet spots, with few reporters, can be changed by one fresh, trusted report.",
        "- **Strong disagreement shows as \"Mixed reports\"** instead of guessing.",
        `- **Old news fades.** After ${S.staleAfterHours} hours the app says when the status was last confirmed. After ${S.unknownAfterHours} hours it says \"Unknown\" and asks someone to report.`,
        "Every confirmed change is saved as a supply session with a start and end time. Those sessions are the source of the hours you see.",
      ],
    },
    {
      id: "hours",
      heading: "Hours of light and the band check",
      text: [
        "From the sessions we work out the hours of light each day (in Lagos time) and each week. Weak light counts as light. Time when nobody has reported is shown as unknown, never guessed, and the average only uses time we actually know about.",
        "The band check compares the average with what the area's tariff band promises each day, and says plainly when there is too little data to be fair. The promised hours follow the NERC band rules; we show the date they are taken from. If you spot a difference from the current rules, please tell us.",
      ],
    },
    {
      id: "limits",
      heading: "What it is not",
      text: [
        "Light Dey? is independent. It is not run by NERC, a DisCo or the government. Its numbers come from neighbours' reports, so they are a guide and not an official record. Areas with few reporters are less reliable, and the page for each spot says how many people have reported.",
      ],
    },
    {
      id: "privacy",
      heading: "Your privacy",
      text: [
        "You do not need to give a name, phone number or exact location. Nobody can see who reported. Read the full Privacy Policy for the details.",
      ],
    },
    {
      id: "help",
      heading: "How you can help",
      text: [
        "Report when the light comes or goes, even if the status has not changed (a quick confirmation helps). Tell your neighbours: the more reporters a spot has, the better the picture. If you add a street or estate, check first that it is not already listed.",
      ],
    },
  ],
};
