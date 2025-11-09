# Prompt Refactoring Plan

## Goal
Restructure `chat_systemMessage` function to use XML sections following Morph's best practices.

## Current Structure (Lines 631-769)
- Flat numbered list of details
- No semantic organization
- Hard to maintain and extend

## New Structure (XML-based)
1. `<identity>` - Role, purpose, operational context
2. `<system_info>` - OS, workspace, files, terminals
3. `<communication>` - Style, tone, formatting guidelines
4. `<tool_calling>` - Tool usage framework (XML or native)
5. `<maximize_context_understanding>` - Information gathering strategy
6. `<making_code_changes>` - Code editing protocols
7. `<external_resources>` - API/package guidelines
8. `<files_overview>` - Directory structure

## Implementation Approach
Due to file size (1309 lines), I'll create a new version of the function and replace the old one in a single large edit.

## Key Changes
- Replace `header` with structured `<identity>` section
- Consolidate communication rules into `<communication>` section
- Separate tool calling instructions by format (XML vs native)
- Add comprehensive `<maximize_context_understanding>` section
- Structure agent-specific rules in `<making_code_changes>` section
- Add `<external_resources>` section for API/package guidelines
