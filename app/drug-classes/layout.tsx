import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Drug Class Rollup',
  description:
    'Roll drug names from claims data, like CMS Part D prescriber files, up to WHO ATC drug classes via RxNorm. Streams files of any size in your browser.',
};

export default function DrugClassesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
