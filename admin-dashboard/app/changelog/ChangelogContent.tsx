"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GitHubRelease } from "@/lib/github";

interface ChangelogContentProps {
  releases: GitHubRelease[];
}

export function ChangelogContent({ releases }: ChangelogContentProps) {
  const [search, setSearch] = useState("");

  const filteredReleases = releases.filter(
    (release) =>
      release.name.toLowerCase().includes(search.toLowerCase()) ||
      release.body.toLowerCase().includes(search.toLowerCase()) ||
      release.tag_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Changelog & Release Notes
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Stay updated with the latest changes and improvements to Fluid.
        </p>
        
        <div className="mt-8 flex justify-center">
           <a 
            href="/changelog/rss.xml" 
            target="_blank" 
            className="flex items-center gap-2 text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors"
          >
            <RSSIcon className="h-4 w-4" />
            Subscribe via RSS
          </a>
        </div>
      </div>

      <div className="relative mb-12">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search releases..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-12">
        {filteredReleases.length > 0 ? (
          filteredReleases.map((release) => (
            <Card key={release.id} className="overflow-hidden border-zinc-200/50  bg-white/50 backdrop-blur-sm ">
              <CardHeader className="border-b border-zinc-200/50  bg-zinc-50/50 ">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl font-bold">{release.name || release.tag_name}</CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-2">
                       <span className="font-mono text-xs bg-zinc-100  px-1.5 py-0.5 rounded border border-zinc-200 ">
                        {release.tag_name}
                      </span>
                      <span>•</span>
                      <span>{new Date(release.published_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}</span>
                    </CardDescription>
                  </div>
                  {release.author && (
                    <div className="flex items-center gap-2">
                      <img 
                        src={release.author.avatar_url} 
                        alt={release.author.login} 
                        className="h-8 w-8 rounded-full border border-zinc-200 "
                      />
                      <span className="hidden text-sm font-medium sm:block">{release.author.login}</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="prose prose-zinc  max-w-none">
                  <ReactMarkdown>{release.body}</ReactMarkdown>
                </div>
                <div className="mt-8 pt-6 border-t border-zinc-200/50 ">
                   <a 
                    href={release.html_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    View on GitHub →
                  </a>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="py-24 text-center">
            <p className="text-lg text-muted-foreground">No releases found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RSSIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  );
}
