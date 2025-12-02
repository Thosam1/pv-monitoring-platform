'use client';

import { memo } from 'react';
import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Markdown text component for rendering assistant messages.
 * Uses GFM (GitHub Flavored Markdown) for tables, strikethrough, etc.
 */
const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md prose prose-sm dark:prose-invert max-w-none"
      components={defaultComponents}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

/**
 * Memoized markdown components for better performance.
 */
const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        'mb-4 scroll-m-20 text-2xl font-bold tracking-tight',
        className
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        'mb-3 mt-6 scroll-m-20 text-xl font-semibold tracking-tight first:mt-0',
        className
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        'mb-2 mt-4 scroll-m-20 text-lg font-semibold tracking-tight first:mt-0',
        className
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        'mb-2 mt-4 scroll-m-20 text-base font-semibold tracking-tight first:mt-0',
        className
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn('mb-3 leading-7 last:mb-0', className)}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        'text-primary font-medium underline underline-offset-4 hover:text-primary/80',
        className
      )}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        'border-l-4 border-border pl-4 italic text-muted-foreground',
        className
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn('my-3 ml-6 list-disc [&>li]:mt-1', className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn('my-3 ml-6 list-decimal [&>li]:mt-1', className)}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn('', className)} {...props} />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn('my-4 border-border', className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <div className="my-4 w-full overflow-x-auto">
      <table
        className={cn('w-full border-collapse text-sm', className)}
        {...props}
      />
    </div>
  ),
  thead: ({ className, ...props }) => (
    <thead className={cn('bg-muted/50', className)} {...props} />
  ),
  tbody: ({ className, ...props }) => (
    <tbody className={cn('', className)} {...props} />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn('border-b border-border', className)}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        'px-3 py-2 text-left font-semibold [&[align=center]]:text-center [&[align=right]]:text-right',
        className
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        'px-3 py-2 [&[align=center]]:text-center [&[align=right]]:text-right',
        className
      )}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        'my-3 overflow-x-auto rounded-lg bg-muted p-4 text-sm',
        className
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !isCodeBlock && 'rounded bg-muted px-1.5 py-0.5 font-mono text-sm',
          className
        )}
        {...props}
      />
    );
  },
  strong: ({ className, ...props }) => (
    <strong className={cn('font-semibold', className)} {...props} />
  ),
  em: ({ className, ...props }) => (
    <em className={cn('italic', className)} {...props} />
  ),
});
