# Design Research MCP

> A Model Context Protocol server that transforms design inspiration into a searchable knowledge base of reusable UI patterns.

---

# Vision

Design inspiration websites like Godly, Minimal Gallery, Awwwards, Site Inspire, and Land-book are excellent sources of ideas, but they are poor databases.

Currently designers save:

- screenshots
- bookmarks
- entire websites

The problem is that websites are combinations of hundreds of small design decisions.

This project decomposes websites into reusable design primitives.

Instead of saving:

> "I like this portfolio."

we save:

- navigation pattern
- spacing system
- typography hierarchy
- hover animation
- card layout
- number treatment
- loading animation
- cursor behavior
- motion language
- grid structure

The MCP becomes a design research assistant rather than a gallery.

---

# Goal

Given any website, automatically produce structured design knowledge that can later be queried through an MCP client.

Example:

Input

https://example.com

↓

Output

Typography
- Editorial
- Swiss
- Monospace labels
- 12-column grid

Components
- Sticky navigation
- Numbered sections
- Image reveal hover
- Magnetic cursor

Animations
- Fade
- Stagger
- Smooth scrolling

Spacing
- 8px scale
- Large whitespace

Tags
editorial
minimal
technical
portfolio

Everything becomes searchable.

---

# Philosophy

We are NOT cloning websites.

We are studying design systems.

The MCP should think like a senior product designer:

"What patterns are reusable?"

rather than

"What does this page look like?"

---

# Inspiration Sources

Primary

- Godly
- Minimal Gallery

Secondary

- Awwwards
- Site Inspire
- Land-book
- Lapa Ninja
- One Page Love
- Httpster
- Maxibestofone

Optional

- Dribbble
- Behance
- GitHub portfolios

---

# Component-first Research

Never save entire websites.

Always extract reusable components.

Examples

Navigation

- Sticky nav
- Transparent nav
- Editorial nav
- Minimal nav

Hero

- Split hero
- Fullscreen hero
- Editorial hero
- Technical hero

Cards

Buttons

Typography

Footers

Loaders

Cursors

Grids

Hover Effects

Page Transitions

Motion

Section Separators

Number Treatments

Annotations

ASCII Elements

Diagram Styles

---

# Target Design Styles

Swiss Typography

International Typographic Style

Editorial Magazine

Technical Documentation

Blueprint

Industrial

Monospace

Terminal UI

ASCII Interfaces

Brutalist Minimalism

Apple Editorial

Film Title Sequences

Museum Exhibition

Scientific Posters

Modern Architecture

Luxury Fashion Editorial

---

# Metadata

Every discovered component should receive metadata.

Example

Component

Editorial Navigation

Metadata

style:
    - editorial
    - swiss
    - minimal

complexity:
    low

interaction:
    hover underline

layout:
    horizontal

theme:
    dark

motion:
    fade

spacing:
    spacious

source:
    https://...

---

# Desired MCP Tools

## Search

search_designs(query)

Examples

editorial portfolio

technical dashboard

swiss typography

ascii ui

---

## Crawl

crawl_website(url)

Captures

- screenshots
- DOM
- CSS
- fonts
- colors
- spacing
- motion

---

## Extract Components

extract_components(url)

Returns

Navigation

Hero

Cards

Buttons

Footer

Forms

Hover Effects

Typography

Grid

Motion

---

## Classify Style

classify_design(url)

Returns confidence scores

Editorial

92%

Swiss

85%

Technical

61%

Terminal

43%

Luxury

22%

---

## Compare

compare_designs(url1, url2)

Find

shared patterns

unique patterns

common typography

common spacing

motion similarities

---

## Recommend

recommend_components(project_description)

Example

"I'm building a dark editorial portfolio."

↓

Recommended

5 navigations

4 number treatments

6 typography systems

3 hover animations

---

## Save

save_component()

Stores

image

metadata

DOM snapshot

CSS

description

embeddings

---

## Search Components

find_components()

Examples

sticky navigation

editorial footer

technical hero

image reveal hover

large page numbers

---

# Data Pipeline

Website

↓

Playwright

↓

DOM Snapshot

↓

Screenshots

↓

LLM Analysis

↓

Component Extraction

↓

Tagging

↓

Embeddings

↓

Vector Database

↓

MCP Search

---

# Future Vision

Eventually the MCP should understand design the same way developers understand code.

Instead of asking:

"Find me websites."

Users ask:

"I need a sophisticated navigation for an editorial AI startup."

The MCP should answer with reusable components rather than links.

---

# Future Features

## Motion Analysis

Record interactions.

Extract

- easing
- duration
- stagger
- delay
- spring

---

## Typography Analysis

Detect

- hierarchy
- font pairing
- rhythm
- line length
- spacing

---

## Grid Detection

Infer

- columns
- margins
- baseline grid
- alignment

---

## Color Intelligence

Extract

- palette
- contrast
- accent strategy

---

## Interaction Analysis

Buttons

Hover

Cursor

Scrolling

Loading

Transitions

Microinteractions

---

## AI Queries

Examples

Find portfolios similar to Linear.

Show technical annotations like Figma.

Find brutalist typography with editorial layouts.

Show all navigation patterns using oversized typography.

Find dark interfaces with blueprint aesthetics.

Suggest components for a robotics startup.

---

# Tech Stack

Frontend
- React
- Next.js
- Tailwind CSS

Automation
- Playwright
- Browser automation

Parsing
- Cheerio
- PostCSS
- CSS parser

AI
- Claude
- GPT
- Local vision models (optional)

Embeddings
- OpenAI
- Voyage AI
- Jina AI

Database
- PostgreSQL
- pgvector

Storage
- S3-compatible object storage

MCP
- TypeScript MCP SDK

---

# Core Principle

The unit of knowledge is **the component**, not the website.

A website is only evidence.

The database should become a library of reusable design decisions that can be searched, compared, recombined, and recommended through natural language.
