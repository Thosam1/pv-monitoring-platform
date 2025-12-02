'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface WorkflowCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}

export function WorkflowCard({ icon: Icon, title, description, onClick }: WorkflowCardProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex flex-col items-center p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors text-center cursor-pointer min-h-[120px] w-full"
    >
      <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
        <Icon className="size-5 text-primary" />
      </div>
      <span className="font-medium text-sm mb-1 leading-tight">{title}</span>
      <span className="text-xs text-muted-foreground leading-snug">{description}</span>
    </motion.button>
  );
}
