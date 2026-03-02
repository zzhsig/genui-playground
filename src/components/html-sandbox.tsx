"use client";

import { useEffect, useRef, useMemo } from "react";

const REACT_SCRIPTS = `<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script crossorigin src="https://unpkg.com/@babel/standalone/babel.min.js"></script>`;

const SHADCN_CSS = `
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;
  --muted: 0 0% 96.1%;
  --muted-foreground: 0 0% 45.1%;
  --accent: 0 0% 96.1%;
  --accent-foreground: 0 0% 9%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 89.8%;
  --input: 0 0% 89.8%;
  --ring: 0 0% 3.9%;
  --radius: 0.5rem;
}
.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --ring: 0 0% 83.1%;
}
* { border-color: hsl(var(--border)); }
body { color: hsl(var(--foreground)); background: hsl(var(--background)); }
`;

const COMPONENT_HELPERS = `
<script>
(function() {
  var h = React.createElement;

  function cn() {
    var classes = [];
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) classes.push(arguments[i]);
    }
    return classes.join(' ');
  }

  window.Card = function(props) {
    return h('div', { className: cn('rounded-xl border bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm', props.className), style: props.style, onClick: props.onClick }, props.children);
  };
  window.CardHeader = function(props) {
    return h('div', { className: cn('flex flex-col space-y-1.5 p-6', props.className) }, props.children);
  };
  window.CardTitle = function(props) {
    return h('h3', { className: cn('text-2xl font-semibold leading-none tracking-tight', props.className) }, props.children);
  };
  window.CardDescription = function(props) {
    return h('p', { className: cn('text-sm text-[hsl(var(--muted-foreground))]', props.className) }, props.children);
  };
  window.CardContent = function(props) {
    return h('div', { className: cn('p-6 pt-0', props.className) }, props.children);
  };
  window.CardFooter = function(props) {
    return h('div', { className: cn('flex items-center p-6 pt-0', props.className) }, props.children);
  };

  window.Button = function(props) {
    var variant = props.variant || 'default';
    var size = props.size || 'default';
    var base = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-[hsl(var(--background))] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer';
    var variants = {
      default: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90',
      destructive: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90',
      outline: 'border border-[hsl(var(--input))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]',
      secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-80',
      ghost: 'hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]',
      link: 'text-[hsl(var(--primary))] underline-offset-4 hover:underline'
    };
    var sizes = {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-md px-3',
      lg: 'h-11 rounded-md px-8',
      icon: 'h-10 w-10'
    };
    return h('button', {
      className: cn(base, variants[variant] || variants.default, sizes[size] || sizes.default, props.className),
      onClick: props.onClick,
      disabled: props.disabled,
      style: props.style,
      type: props.type || 'button'
    }, props.children);
  };

  window.Badge = function(props) {
    var variant = props.variant || 'default';
    var base = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors';
    var variants = {
      default: 'border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
      secondary: 'border-transparent bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]',
      destructive: 'border-transparent bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]',
      outline: 'text-[hsl(var(--foreground))]'
    };
    return h('div', { className: cn(base, variants[variant] || variants.default, props.className), style: props.style }, props.children);
  };

  window.Progress = function(props) {
    var value = props.value || 0;
    return h('div', { className: cn('relative h-4 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]', props.className) },
      h('div', { className: 'h-full w-full flex-1 bg-[hsl(var(--primary))] transition-all rounded-full', style: { transform: 'translateX(-' + (100 - value) + '%)' } })
    );
  };

  window.Separator = function(props) {
    var orientation = props.orientation || 'horizontal';
    return h('div', {
      className: cn(
        'shrink-0 bg-[hsl(var(--border))]',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        props.className
      )
    });
  };

  // Simple tabs implementation
  window.Tabs = function(props) {
    var _s = React.useState(props.defaultValue || '');
    var active = _s[0], setActive = _s[1];
    return h('div', { className: cn('w-full', props.className), 'data-active': active },
      React.Children.map(props.children, function(child) {
        if (!child) return null;
        return React.cloneElement(child, { _active: active, _setActive: setActive });
      })
    );
  };
  window.TabsList = function(props) {
    return h('div', { className: cn('inline-flex h-10 items-center justify-center rounded-md bg-[hsl(var(--muted))] p-1 text-[hsl(var(--muted-foreground))]', props.className) },
      React.Children.map(props.children, function(child) {
        if (!child) return null;
        return React.cloneElement(child, { _active: props._active, _setActive: props._setActive });
      })
    );
  };
  window.TabsTrigger = function(props) {
    var isActive = props._active === props.value;
    return h('button', {
      className: cn('inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-[hsl(var(--background))] transition-all cursor-pointer',
        isActive ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm' : ''),
      onClick: function() { props._setActive && props._setActive(props.value); },
      type: 'button'
    }, props.children);
  };
  window.TabsContent = function(props) {
    if (props._active !== props.value) return null;
    return h('div', { className: cn('mt-2 ring-offset-[hsl(var(--background))]', props.className) }, props.children);
  };
})();
</script>`;

function prepareContent(content: string, dark?: boolean): string {
  const darkClass = dark ? ' class="dark"' : '';

  // Content with <head> — inject React scripts into head
  if (/<head[\s>]/i.test(content)) {
    return content.replace(/<head([^>]*)>/i, `<head$1>${REACT_SCRIPTS}`);
  }

  // Content with <html> but no <head> — add head with scripts
  if (/<html[\s>]/i.test(content)) {
    return content.replace(/<html([^>]*)>/i, `<html$1><head>${REACT_SCRIPTS}</head>`);
  }

  // Plain content — wrap in full document with React available
  return `<!DOCTYPE html><html${darkClass}><head>
<meta charset="utf-8">
<script src="https://cdn.tailwindcss.com"></script>
${REACT_SCRIPTS}
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}#root{width:100%;height:100%}${SHADCN_CSS}</style>
</head><body><div id="root"></div>
${COMPONENT_HELPERS}
${content}
</body></html>`;
}

interface HtmlSandboxProps {
  content: string;
  height?: string;
  dark?: boolean;
  onAction?: (action: string, data?: Record<string, unknown>) => void;
}

export function HtmlSandbox({
  content,
  height = "500px",
  dark,
  onAction,
}: HtmlSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const preparedContent = useMemo(() => prepareContent(content, dark), [content, dark]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "genui-action" && onAction) {
        onAction(event.data.action, event.data.data);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onAction]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={preparedContent}
      sandbox="allow-scripts"
      style={{ width: "100%", height, border: "none", borderRadius: "8px" }}
      title="Custom widget"
    />
  );
}
