'use client';

import { memo, Component, type ReactNode } from 'react';
import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

/**
 * Error boundary to catch React rendering errors in markdown content.
 * Prevents crashes when the LLM outputs structured data that can't be rendered.
 */
class MarkdownErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      // Render a fallback UI instead of crashing
      return (
        <div className="my-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Unable to display this content properly.
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                The response may contain structured data that couldn't be rendered as text.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Markdown text component for rendering assistant messages.
 * Uses GFM (GitHub Flavored Markdown) for tables, strikethrough, etc.
 * Wrapped in error boundary to prevent crashes from malformed content.
 */
const MarkdownTextImpl = () => {
  return (
    <MarkdownErrorBoundary>
      <MarkdownTextPrimitive
        remarkPlugins={[remarkGfm]}
        className="aui-md prose prose-sm dark:prose-invert max-w-none"
        components={defaultComponents}
      />
    </MarkdownErrorBoundary>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

/**
 * Memoized markdown components for better performance.
 */
const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, children, ...props }) => (
    <h1
      className={cn(
        'mb-4 scroll-m-20 text-2xl font-bold tracking-tight',
        className
      )}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2
      className={cn(
        'mb-3 mt-6 scroll-m-20 text-xl font-semibold tracking-tight first:mt-0',
        className
      )}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3
      className={cn(
        'mb-2 mt-4 scroll-m-20 text-lg font-semibold tracking-tight first:mt-0',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ className, children, ...props }) => (
    <h4
      className={cn(
        'mb-2 mt-4 scroll-m-20 text-base font-semibold tracking-tight first:mt-0',
        className
      )}
      {...props}
    >
      {children}
    </h4>
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn('mb-3 leading-7 last:mb-0', className)}
      {...props}
    />
  ),
  a: ({ className, children, ...props }) => (
    <a
      className={cn(
        'text-primary font-medium underline underline-offset-4 hover:text-primary/80',
        className
      )}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
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
    <section className="my-4 w-full overflow-x-auto">
      <table
        role="table"
        aria-label="Data table"
        className={cn('w-full border-collapse text-sm', className)}
        {...props}
      />
    </section>
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
      scope="col"
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
