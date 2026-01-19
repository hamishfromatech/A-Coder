import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// StickyToBottom Context for managing scroll state
const StickToBottomContext = createContext(null);

// Hook to access StickyToBottom context
const useStickToBottomContext = () => {
  const context = useContext(StickToBottomContext);
  if (!context) {
    throw new Error('Conversation components must be used within Conversation');
  }
  return context;
};

// Main Conversation component - wraps messages and manages scrolling
export const Conversation = React.forwardRef(({ 
  className,
  children,
  contextRef,
  ...props 
}, ref) => {
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  // Scroll to bottom with smooth behavior
  const scrollToBottom = useCallback((force = false) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: force ? 'instant' : 'smooth'
      });
      setIsAtBottom(true);
      setAutoScroll(true);
    }
  }, []);

  // Check if user scrolled to top
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
    setIsAtBottom(atBottom);
    
    // Disable auto-scroll if user manually scrolled up
    if (!atBottom) {
      setAutoScroll(false);
    } else {
      setAutoScroll(true);
    }
  }, []);

  // Expose context methods
  useEffect(() => {
    const contextValue = {
      isAtBottom,
      scrollToBottom,
      autoScroll,
      setAutoScroll
    };
    
    if (contextRef && typeof contextRef === 'function') {
      contextRef(contextValue);
    } else if (contextRef && 'current' in contextRef) {
      contextRef.current = contextValue;
    }
  }, [isAtBottom, scrollToBottom, autoScroll, contextRef]);

  // Auto-scroll when content changes
  useEffect(() => {
    if (autoScroll && children) {
      scrollToBottom();
    }
  }, [children, autoScroll, scrollToBottom]);

  // Render prop support
  const contextValue = {
    isAtBottom,
    scrollToBottom,
    autoScroll,
    setAutoScroll
  };

  const content = typeof children === 'function'
    ? children(contextValue)
    : children;

  return (
    <StickToBottomContext.Provider value={contextValue}>
      <div
        ref={(node) => {
          // Handle both refs
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
          if (node) {
            containerRef.current = node;
          }
        }}
        className={cn('flex flex-col h-full', className)}
        {...props}
      >
        {content}
      </div>
    </StickToBottomContext.Provider>
  );
});
Conversation.displayName = 'Conversation';

// ConversationContent - scrollable content area with messages
export const ConversationContent = React.forwardRef(({ 
  className,
  children,
  ...props 
}, ref) => {
  const { scrollToBottom, setAutoScroll } = useStickToBottomContext();
  const scrollRef = useRef(null);

  // Expose the scroll ref through the forwarded ref
  React.useImperativeHandle(ref, () => scrollRef.current);

  const content = typeof children === 'function'
    ? children(useStickToBottomContext())
    : children;

  return (
    <div
      ref={scrollRef}
      onScroll={() => {
        // Propagate scroll logic to parent
        if (scrollRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          const atBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
          if (!atBottom) {
            setAutoScroll(false);
          }
        }
      }}
      className={cn('flex-1 overflow-y-auto', className)}
      {...props}
    >
      {content}
    </div>
  );
});
ConversationContent.displayName = 'ConversationContent';

// ConversationEmptyState - placeholder when no messages
export const ConversationEmptyState = React.forwardRef(({ 
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center h-full p-8 text-center',
        className
      )}
      {...props}
    >
      {icon && (
        <div className="mb-4 text-muted-foreground/50">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        {description}
      </p>
      {children}
    </div>
  );
});
ConversationEmptyState.displayName = 'ConversationEmptyState';

// ConversationScrollButton - appears when not at bottom
export const ConversationScrollButton = React.forwardRef(({ 
  className,
  ...props 
}, ref) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) {
    return null;
  }

  return (
    <Button
      ref={ref}
      variant="default"
      size="icon"
      onClick={() => scrollToBottom()}
      className={cn(
        'absolute bottom-4 right-4 rounded-full shadow-lg',
        className
      )}
      {...props}
    >
      <Icon name="arrowDown" size={16} />
    </Button>
  );
});
ConversationScrollButton.displayName = 'ConversationScrollButton';

// Legacy components for backward compatibility

// Conversation item for list - legacy component
export const ConversationItem = React.forwardRef(({ 
  className,
  title,
  subtitle,
  timestamp,
  messageCount,
  active = false,
  onClick,
  onDelete,
  onPin,
  isPinned = false,
}, ref) => {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      ref={ref}
      className={cn(
        'group relative p-3 rounded-lg border transition-all cursor-pointer',
        active 
          ? 'bg-primary/10 border-primary/30' 
          : 'bg-card border-border hover:bg-accent hover:border-accent/50',
        className
      )}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Pin Indicator */}
          <div className="flex items-center gap-2">
            {isPinned && (
              <Icon name="pin" size={12} className="text-primary flex-shrink-0" />
            )}
            <h4 className="text-sm font-medium text-foreground truncate">
              {title}
            </h4>
          </div>
        </div>

        {/* Actions */}
        <div className={cn(
          'flex items-center gap-1 transition-opacity',
          showActions ? 'opacity-100' : 'opacity-0'
        )}>
          {onPin && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onPin();
              }}
              className="h-6 w-6"
            >
              <Icon name={isPinned ? 'pinOff' : 'pin'} size={12} />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Icon name="trash" size={12} />
            </Button>
          )}
        </div>
      </div>

      {/* Subtitle/Preview */}
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {subtitle}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2">
        {messageCount !== undefined && (
          <div className="flex items-center gap-1">
            <Icon name="messageSquare" size={10} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {messageCount} messages
            </span>
          </div>
        )}
        {timestamp && (
          <>
            <span className="text-muted-foreground/50">•</span>
            <span className="text-xs text-muted-foreground">
              {typeof timestamp === 'string' 
                ? new Date(timestamp).toLocaleDateString()
                : timestamp.toLocaleDateString()
              }
            </span>
          </>
        )}
      </div>
    </div>
  );
});
ConversationItem.displayName = 'ConversationItem';

export const ConversationList = React.forwardRef(({ 
  className,
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onPinConversation,
  searchQuery = '',
  onSearch,
  onCreateNew,
  ...props 
}, ref) => {
  const filteredConversations = searchQuery
    ? conversations.filter(conv => 
        conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.subtitle?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const pinnedConversations = filteredConversations.filter(c => c.isPinned);
  const regularConversations = filteredConversations.filter(c => !c.isPinned);

  return (
    <div
      ref={ref}
      className={cn('space-y-4', className)}
      {...props}
    >
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch?.(e.target.value)}
          placeholder="Search conversations..."
          className="w-full rounded-lg border border-border bg-card px-9 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>

      {/* New Conversation Button */}
      {onCreateNew && (
        <Button
          variant="outline"
          onClick={onCreateNew}
          className="w-full justify-start gap-2"
        >
          <Icon name="plus" size={14} />
          New Conversation
        </Button>
      )}

      {/* Pinned Conversations */}
      {pinnedConversations.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Pinned
          </div>
          {pinnedConversations.map((conv, index) => (
            <ConversationItem
              key={conv.id || index}
              {...conv}
              active={activeConversationId === conv.id}
              onClick={() => onSelectConversation?.(conv.id)}
              onDelete={() => onDeleteConversation?.(conv.id)}
              onPin={() => onPinConversation?.(conv.id)}
            />
          ))}
        </div>
      )}

      {/* Regular Conversations */}
      <div className="space-y-2">
        {pinnedConversations.length > 0 && regularConversations.length > 0 && (
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            All Conversations
          </div>
        )}
        {regularConversations.length === 0 && pinnedConversations.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          regularConversations.map((conv, index) => (
            <ConversationItem
              key={conv.id || index}
              {...conv}
              active={activeConversationId === conv.id}
              onClick={() => onSelectConversation?.(conv.id)}
              onDelete={() => onDeleteConversation?.(conv.id)}
              onPin={() => onPinConversation?.(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  );
});
ConversationList.displayName = 'ConversationList';

export const ConversationActions = React.forwardRef(({ 
  className,
  onNewChat,
  onArchive,
  onClearHistory,
  ...props 
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1 border-t border-border pt-2', className)}
      {...props}
    >
      {onNewChat && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewChat}
          className="w-full justify-start gap-2 h-9"
        >
          <Icon name="messageSquare" size={14} />
          New Chat
        </Button>
      )}
      {onArchive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onArchive}
          className="w-full justify-start gap-2 h-9"
        >
          <Icon name="archive" size={14} />
          Archive Chats
        </Button>
      )}
      {onClearHistory && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearHistory}
          className="w-full justify-start gap-2 h-9"
        >
          <Icon name="trash" size={14} />
          Clear History
        </Button>
      )}
    </div>
  );
});
ConversationActions.displayName = 'ConversationActions';