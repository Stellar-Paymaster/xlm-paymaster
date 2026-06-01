"use client";

import * as React from "react";
import { 
  HelpCircle, 
  BookOpen, 
  MessageSquare, 
  ExternalLink, 
  FileText,
  LifeBuoy
} from "lucide-react";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "./ui/popover";
import { Button } from "./ui/button";
import { getPortalLinks } from "@/lib/portal-links";
import Link from "next/link";

export function HelpCenter() {
  const links = getPortalLinks();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
          id="help-center-trigger"
        >
          <HelpCircle className="h-5 w-5" />
          <span className="sr-only">Help Center</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 overflow-hidden border-border/50">
        <div className="bg-muted/50 p-4 border-b border-border/50">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-primary" />
            Help & Support
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Need help with Fluid? We're here to assist you.
          </p>
        </div>
        
        <div className="p-2">
          <Link 
            href={links.docs} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors group"
          >
            <div className="bg-blue-500/10 p-2 rounded-md group-hover:bg-blue-500/20 transition-colors">
              <BookOpen className="h-4 w-4 text-blue-500" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Documentation</div>
              <div className="text-[10px] text-muted-foreground">Guides, API references, and more</div>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>

          <Link 
            href={links.helpCenter} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors group"
          >
            <div className="bg-purple-500/10 p-2 rounded-md group-hover:bg-purple-500/20 transition-colors">
              <FileText className="h-4 w-4 text-purple-500" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Help Center</div>
              <div className="text-[10px] text-muted-foreground">Find answers to common questions</div>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>

          <Link 
            href={links.support} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors group"
          >
            <div className="bg-orange-500/10 p-2 rounded-md group-hover:bg-orange-500/20 transition-colors">
              <MessageSquare className="h-4 w-4 text-orange-500" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Support Tickets</div>
              <div className="text-[10px] text-muted-foreground">Open a ticket with our support team</div>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>

        <div className="bg-muted/30 p-3 border-t border-border/50 text-center">
          <Link 
            href={links.discord} 
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            Join our Discord Community <ExternalLink className="h-2 w-2" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
