# Phase 6: High Priority Features

## Priority: HIGH

## Overview

This phase implements three high-value features that enhance collaboration and usability:

1. **Template Creation Finalization** - Add missing "Save as Template" UI (backend 95% done)
2. **Discussions/Comments** - Thread-based comments on entities (schema exists, no UI)
3. **Status Updates** - Timeline-style project updates (schema exists, no UI)

## Current State

### Templates
- **Database:** `is_template` flag exists on projects, phases, sets, pitches, requirements
- **RPC:** `duplicate_project()` function works correctly
- **API:** `projectsApi.saveAsTemplate()` and `createFromTemplate()` implemented
- **Hooks:** `useProjectTemplates()` and mutations implemented
- **UI:** TemplatesPage exists and works for browsing/creating FROM templates
- **MISSING:** "Save as Template" button on ProjectDetailPage

### Discussions
- **Database:** `discussions` table exists with entity linking
- **API:** `discussionsApi` service exists
- **Hooks:** None implemented
- **UI:** Zero - no components, no pages, not wired anywhere

### Status Updates
- **Database:** `status_updates` table exists
- **API:** `statusUpdatesApi` service exists
- **Hooks:** None implemented
- **UI:** Zero - no components, no pages

## Success Criteria

1. Users can save any project as a template from ProjectDetailPage
2. Users can add/view/reply to discussions on any entity detail page
3. Users can post status updates on projects visible in a timeline

## Dependencies

- Phase 5 (User Management Fix) should be completed first to ensure clean testing environment
