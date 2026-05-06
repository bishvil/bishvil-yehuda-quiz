import Image from "next/image";
import styles from "./LogoCarousel.module.css";

const logos = [
  { src: "/logos/logo_main.png", alt: "בשביל — מסלול ראשי" },
  { src: "/logos/logo_yehuda.png", alt: "בשביל יהודה" },
  { src: "/logos/logo_haari.png", alt: "בשביל הארי" },
  { src: "/logos/logo_tzafon.png", alt: "בשביל הצפון" },
  { src: "/logos/logo_etzion.png", alt: "בשביל עציון" },
  { src: "/logos/logo_shomeron.png", alt: "בשביל השומרון" },
  { src: "/logos/logo_haganat.png", alt: "בשביל הגנת היישוב" },
] as const;

function LogoGroup({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className={styles.group} role={hidden ? undefined : "list"} aria-hidden={hidden}>
      {logos.map((logo) => (
        <li className={styles.item} key={logo.src}>
          <Image
            src={logo.src}
            alt={hidden ? "" : logo.alt}
            width={96}
            height={96}
            className={styles.logo}
          />
        </li>
      ))}
    </ul>
  );
}

export default function LogoCarousel() {
  return (
    <section className={styles.section} aria-label="מסלולי בשביל">
      <div className={styles.viewport}>
        <div className={styles.track}>
          <LogoGroup />
          <LogoGroup hidden />
        </div>
      </div>
    </section>
  );
}
