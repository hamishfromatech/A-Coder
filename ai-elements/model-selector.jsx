import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const ModelSelector = React.forwardRef(({ 
  className,
  models = [],
  value,
  onChange,
  placeholder = "Select model...",
  isLoading = false,
  onRefresh,
  showRefresh = false,
  side = 'bottom',
  ...props 
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  const filteredModels = searchQuery
    ? models.filter(m => 
        m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.value.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : models;

  const selectedModel = models.find(m => m.value === value);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (model) => {
    onChange?.(model.value);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div
      ref={ref}
      className={cn('relative', className)}
      {...props}
    >
      {/* Trigger */}
      <div
        ref={triggerRef}
        onClick={() => !isLoading && setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
          'bg-card border-border hover:border-primary/50',
          isOpen && 'ring-2 ring-primary ring-offset-2',
          isLoading && 'cursor-not-allowed opacity-50'
        )}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon name="bot" size={16} className="text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-foreground truncate">
            {selectedModel?.label || placeholder}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          {showRefresh && onRefresh && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              disabled={isLoading}
              className="h-6 w-6"
            >
              {isLoading ? (
                <Icon name="loader" size={12} className="animate-spin" />
              ) : (
                <Icon name="refresh" size={12} />
              )}
            </Button>
          )}
          <Icon 
            name={isOpen ? 'chevronUp' : 'chevronDown'} 
            size={14} 
            className="text-muted-foreground"
          />
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute z-50 w-full rounded-lg border bg-card shadow-lg',
            side === 'top' ? 'bottom-full mb-1' : 'mt-1',
            'max-h-80 overflow-hidden flex flex-col'
          )}
        >
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="w-full rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
          </div>

          {/* Model List */}
          <div className="overflow-y-auto overflow-x-hidden flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                <Icon name="loader" size={14} className="animate-spin" />
                <span>Loading models...</span>
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                {searchQuery ? 'No models found' : 'No models available'}
              </div>
            ) : (
              <div className="p-1">
                {filteredModels.map((model) => (
                  <div
                    key={model.value}
                    onClick={() => handleSelect(model)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      value === model.value && 'bg-primary/10 text-primary'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {model.label}
                      </div>
                      {model.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {model.description}
                        </div>
                      )}
                    </div>
                    {value === model.value && (
                      <Icon name="check" size={14} className="text-primary flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {models.length > 0 && (
            <div className="p-2 border-t border-border text-xs text-muted-foreground text-center">
              {models.length} model{models.length !== 1 ? 's' : ''} available
            </div>
          )}
        </div>
      )}
    </div>
  );
});
ModelSelector.displayName = 'ModelSelector';

export const ModelSelectorCompact = React.forwardRef(({ 
  className,
  models = [],
  value,
  onChange,
  ...props 
}, ref) => {
  const selectedModel = models.find(m => m.value === value);

  return (
    <div
      ref={ref}
      className={cn('relative', className)}
      {...props}
    >
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          'appearance-none pr-8 pl-3 py-1.5 rounded-md border',
          'bg-card border-border text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'cursor-pointer'
        )}
      >
        <option value="">Select model...</option>
        {models.map((model) => (
          <option key={model.value} value={model.value}>
            {model.label}
          </option>
        ))}
      </select>
      <Icon 
        name="chevronDown" 
        size={14} 
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      />
    </div>
  );
});
ModelSelectorCompact.displayName = 'ModelSelectorCompact';