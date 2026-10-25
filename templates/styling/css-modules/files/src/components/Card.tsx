import type { ReactNode } from "react";
import styles from "./Card.module.css";

export interface CardProps {
  title: string;
  children: ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </section>
  );
}
