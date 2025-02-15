import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useEffect } from 'react';
import { Message } from '@/lib/api-types';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/error-boundary';

interface VirtualizedMessageListProps {
  messages: Message[];
  currentUserId?: number;
  isLoading: boolean;
  onLoadMore: () => void;
}

function MessageRow({ message, isCurrentUser }: { message: Message; isCurrentUser: boolean }) {
  return (
    <div
      className={`rounded-lg px-4 py-2 ${
        isCurrentUser
          ? "bg-primary text-primary-foreground ml-auto"
          : "bg-muted"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{message.user.username}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(message.createdAt).toLocaleTimeString()}
        </p>
      </div>
      <p>{message.content}</p>
    </div>
  );
}

export function VirtualizedMessageList({
  messages,
  currentUserId,
  isLoading,
  onLoadMore
}: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.5 }
    );

    const firstMessage = parentRef.current?.querySelector('[data-index="0"]');
    if (firstMessage) {
      observer.observe(firstMessage);
    }

    return () => observer.disconnect();
  }, [isLoading, onLoadMore]);

  if (isLoading && !messages.length) {
    return (
      <div className="animate-pulse space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div
        ref={parentRef}
        className="h-[300px] overflow-y-auto p-4 border rounded-lg"
        style={{
          contain: 'strict',
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const message = messages[virtualRow.index];
            const isCurrentUser = message.userId === currentUserId;

            return (
              <div
                key={message.id}
                data-index={virtualRow.index}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MessageRow message={message} isCurrentUser={isCurrentUser} />
              </div>
            );
          })}
        </div>
      </div>
    </ErrorBoundary>
  );
}