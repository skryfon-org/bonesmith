import type { ReactNode } from "react";
import styled from "styled-components";
import { tokens } from "../styles/tokens";

const Section = styled.section`
  padding: ${tokens.space};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.radius};
`;

const Title = styled.h2`
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
`;

export interface CardProps {
  title: string;
  children: ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <Section aria-label={title}>
      <Title>{title}</Title>
      {children}
    </Section>
  );
}
