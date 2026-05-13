import Image from "next/image";
import Link from "next/link";

const COPY: Record<
  string,
  { title: string; body: string; actionHref: string; actionLabel: string }
> = {
  staff: {
    title: "החשבון עדיין לא מחובר לצוות",
    body: "נכנסת עם Google בהצלחה, אבל החשבון הזה עדיין לא משויך כמארח או כמנהל. אפשר לפנות למנהל המערכת כדי לחבר את המייל לצוות.",
    actionHref: "/login",
    actionLabel: "חזרה להתחברות",
  },
  participant: {
    title: "לא הצלחנו להשלים את ההצטרפות",
    body: "החיבור ל-Google עבר, אבל קוד החידון לא נשמר בדרך חזרה. חזרו למסך ההצטרפות והזינו שוב את קוד ה-PIN.",
    actionHref: "/",
    actionLabel: "חזרה לדף הבית",
  },
  oauth: {
    title: "החיבור ל-Google לא הושלם",
    body: "משהו בתהליך ההתחברות נעצר לפני שהצלחנו לאמת את החשבון. אפשר לנסות שוב בעוד רגע.",
    actionHref: "/login",
    actionLabel: "נסו שוב",
  },
};

interface AccessNeededPageProps {
  searchParams: Promise<{ reason?: string }>;
}

export default async function AccessNeededPage({
  searchParams,
}: AccessNeededPageProps) {
  const { reason } = await searchParams;
  const copy = COPY[reason ?? ""] ?? COPY.oauth!;

  return (
    <main className="flex min-h-screen items-center justify-center bg-bsy-paper px-5 py-10">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-[var(--radius-xl)] border border-bsy-stone-100 bg-white shadow-[0_10px_32px_rgba(74,63,38,0.12)] md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative min-h-[220px] md:min-h-[420px]">
          <Image
            src="/images/home-hero-bg.webp"
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 480px, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(48,96,48,0.12),rgba(74,63,38,0.35))]" />
        </div>
        <div className="flex flex-col justify-center px-7 py-9 text-right sm:px-10">
          <Image
            src="/logos/logo_yehuda.png"
            alt="בשביל יהודה"
            width={124}
            height={62}
            className="mb-7 h-14 w-auto self-end object-contain"
          />
          <h1 className="m-0 font-[var(--font-display)] text-[34px] leading-tight text-bsy-brown">
            {copy.title}
          </h1>
          <p className="mt-4 text-base leading-8 text-bsy-stone-700">
            {copy.body}
          </p>
          <Link
            href={copy.actionHref}
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-[var(--radius-pill)] bg-bsy-green-forest px-7 text-base font-bold text-bsy-paper no-underline"
          >
            {copy.actionLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
