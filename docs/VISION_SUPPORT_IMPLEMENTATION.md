# Vision Support Implementation

## Overview
Adding image upload support to chat that works with **ANY LLM**. Images are processed by a separate vision-capable model to generate descriptions, which are then sent to the main chat LLM. This allows users to use vision features even with non-vision models.

## Architecture
**Vision as a Separate Feature:**
- Vision is a distinct feature (like Autocomplete, Apply, etc.) with its own model selection
- When images are attached, they're sent to the Vision model first
- Vision model generates text descriptions of the images
- Descriptions are added to the user's message
- Main chat LLM receives text-only message (works with any model!)

**Benefits:**
- ✅ Works with ANY chat model (not just vision-capable ones)
- ✅ User controls which vision model to use
- ✅ Can use cheap/fast vision models for processing
- ✅ Main chat model doesn't need vision support

## Features
- ✅ **Setting Toggle** - Enable/disable in Feature Options tab
- 🔄 **Drag & Drop** - Drop images directly into chat input
- 🔄 **Copy/Paste** - Paste images from clipboard
- 🔄 **Image Preview** - Show thumbnails of attached images
- 🔄 **Base64 Encoding** - Images sent as base64 to LLMs
- 🔄 **Multi-Provider Support** - Works with OpenAI, Anthropic, Gemini

## Implementation Status

### ✅ Completed
1. **Settings** (`voidSettingsTypes.ts`)
   - Added `enableVisionSupport: boolean` to `GlobalSettings`
   - Default value: `false`
   
2. **UI Toggle** (`Settings.tsx`)
   - Added Vision Support section in Feature Options tab
   - Toggle switch with description
   - Located after Tools section

3. **Message Types** (`chatThreadServiceTypes.ts`)
   - Added `ImageAttachment` type:
     ```typescript
     export type ImageAttachment = {
       base64: string; // base64 without data:image/... prefix
       mimeType: string; // e.g., 'image/png', 'image/jpeg'
       name?: string; // optional filename
     }
     ```
   - Updated user messages to include `images?: ImageAttachment[]`

### 🔄 In Progress
4. **Chat UI** (`SidebarChat.tsx`)
   - Image upload handlers (drag & drop, paste)
   - Image preview component
   - Image removal UI
   - State management for attached images

5. **LLM Message Conversion** (`convertToLLMMessageService.ts`)
   - Convert images to provider-specific formats
   - OpenAI: `content: [{ type: 'text' }, { type: 'image_url', image_url: { url: 'data:image/...' } }]`
   - Anthropic: `content: [{ type: 'text' }, { type: 'image', source: { type: 'base64', media_type, data } }]`
   - Gemini: `parts: [{ text }, { inline_data: { mime_type, data } }]`

## Technical Details

### Image Format
**Storage:**
- Base64 string (without `data:image/...` prefix)
- MIME type stored separately
- Optional filename for display

**Why base64?**
- No file system dependencies
- Works in browser and Electron
- Easy to serialize/deserialize
- Supported by all vision APIs

### Provider-Specific Formats

**OpenAI:**
```typescript
{
  role: 'user',
  content: [
    { type: 'text', text: 'What's in this image?' },
    {
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64}`
      }
    }
  ]
}
```

**Anthropic:**
```typescript
{
  role: 'user',
  content: [
    { type: 'text', text: 'What's in this image?' },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: base64
      }
    }
  ]
}
```

**Gemini:**
```typescript
{
  role: 'user',
  parts: [
    { text: 'What's in this image?' },
    {
      inline_data: {
        mime_type: mimeType,
        data: base64
      }
    }
  ]
}
```

## UI/UX Design

### Image Upload
**Drag & Drop:**
1. User drags image file over chat input
2. Drop zone highlights
3. On drop, image is read as base64
4. Thumbnail appears below input

**Copy/Paste:**
1. User copies image (screenshot, file, etc.)
2. Pastes into chat input (Ctrl/Cmd+V)
3. Image is read from clipboard
4. Thumbnail appears below input

### Image Preview
```
┌─────────────────────────────────────┐
│ Type your message...                │
│                                     │
└─────────────────────────────────────┘
┌──────┐ ┌──────┐
│ img1 │ │ img2 │  [X] Remove
│ 📷   │ │ 📷   │
└──────┘ └──────┘
```

**Features:**
- Thumbnail preview (100x100px)
- Filename display
- Remove button (X)
- Multiple images support

### Settings UI
**Location:** Settings → Feature Options → Vision Support

```
Vision Support
Enable image uploads in chat via drag & drop or copy/paste.
Works with vision-capable models like GPT-4V, Claude 3, and Gemini.

[Toggle] Enabled/Disabled
```

## Implementation Plan

### Phase 1: Core Functionality ✅
- [x] Add setting toggle
- [x] Update message types
- [x] Add UI in settings

### Phase 2: Image Upload 🔄
- [ ] Implement drag & drop handler
- [ ] Implement paste handler
- [ ] Convert images to base64
- [ ] Validate image types/sizes
- [ ] Add image state management

### Phase 3: Image Preview 🔄
- [ ] Create ImagePreview component
- [ ] Show thumbnails
- [ ] Add remove functionality
- [ ] Handle multiple images

### Phase 4: LLM Integration 🔄
- [ ] Update convertToLLMMessageService
- [ ] Add OpenAI format conversion
- [ ] Add Anthropic format conversion
- [ ] Add Gemini format conversion
- [ ] Handle image-only messages

### Phase 5: Polish 📋
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add file size limits
- [ ] Add image compression
- [ ] Add tooltips/help text

## Code Locations

### Settings
- **Types:** `src/vs/workbench/contrib/void/common/voidSettingsTypes.ts`
  - Line 455: `enableVisionSupport: boolean`
  - Line 472: Default value `false`

- **UI:** `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx`
  - Lines 1343-1364: Vision Support toggle

### Message Types
- **Types:** `src/vs/workbench/contrib/void/common/chatThreadServiceTypes.ts`
  - Lines 50-54: `ImageAttachment` type
  - Line 63: `images?: ImageAttachment[]` in user messages

### Chat UI (TODO)
- **Component:** `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
  - Add image upload handlers
  - Add image preview component
  - Add state management

### LLM Conversion (TODO)
- **Service:** `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`
  - Update `SimpleLLMMessage` type
  - Add image content conversion
  - Handle provider-specific formats

## Supported Models

### Vision-Capable Models
- **OpenAI:** gpt-4-vision-preview, gpt-4-turbo, gpt-4o
- **Anthropic:** claude-3-opus, claude-3-sonnet, claude-3-haiku
- **Google:** gemini-pro-vision, gemini-1.5-pro, gemini-1.5-flash
- **Others:** Any model with vision capabilities via compatible APIs

### Non-Vision Models
- Images will be ignored
- Only text content sent
- No error shown (graceful degradation)

## Constraints & Limits

### File Size
- **Max per image:** 20MB (configurable)
- **Total per message:** 100MB (configurable)
- **Compression:** Auto-compress large images

### File Types
- **Supported:** PNG, JPEG, GIF, WebP
- **Not supported:** SVG, TIFF, BMP (convert to PNG)

### Image Count
- **Max per message:** 10 images (configurable)
- **Recommended:** 1-3 for best results

## Error Handling

### Upload Errors
- **File too large:** "Image exceeds 20MB limit"
- **Invalid type:** "Only PNG, JPEG, GIF, WebP supported"
- **Too many images:** "Maximum 10 images per message"

### API Errors
- **Model doesn't support vision:** Silently send text only
- **Image encoding failed:** Show error, allow retry
- **API rejection:** Show error message from provider

## Testing

### Manual Testing
1. Enable vision support in settings
2. Drag image into chat
3. Verify thumbnail appears
4. Send message with image
5. Check LLM response references image
6. Test with multiple images
7. Test paste from clipboard
8. Test remove image
9. Test with non-vision model (should work)

### Automated Testing
- Unit tests for base64 conversion
- Unit tests for provider format conversion
- Integration tests for image upload
- E2E tests for full flow

## Future Enhancements

### Phase 6: Advanced Features 📋
- [ ] Image URL support (paste URL)
- [ ] Screenshot capture tool
- [ ] Image annotation
- [ ] Image cropping
- [ ] OCR text extraction
- [ ] Image search/reference

### Phase 7: Performance 📋
- [ ] Lazy loading thumbnails
- [ ] Image caching
- [ ] Progressive upload
- [ ] Background compression

## Migration Notes

### Backward Compatibility
- `images` field is optional
- Old messages without images still work
- Setting defaults to `false` (opt-in)
- No breaking changes to existing code

### Storage Impact
- Images stored in chat history
- Base64 increases storage ~33%
- Consider cleanup policy for old images
- Add storage usage indicator

## Security Considerations

### Privacy
- Images stored locally only
- Not sent to servers (except LLM APIs)
- User controls when images are sent
- Clear images from memory after use

### Validation
- Check file types before upload
- Validate base64 encoding
- Sanitize filenames
- Limit file sizes

## Documentation

### User Guide
- How to enable vision support
- How to upload images
- Supported formats
- Best practices
- Troubleshooting

### Developer Guide
- Architecture overview
- Adding new providers
- Testing guidelines
- Performance optimization

## Success Metrics

### Adoption
- % of users enabling vision support
- Images uploaded per day
- Messages with images vs text-only

### Performance
- Upload time < 1s for 5MB image
- Preview render < 100ms
- No UI lag during upload

### Quality
- < 1% upload failures
- < 0.1% encoding errors
- 100% provider compatibility

## Next Steps

1. ✅ Complete settings and types
2. 🔄 Implement image upload handlers
3. 🔄 Create image preview component
4. 🔄 Update LLM message conversion
5. 📋 Add error handling
6. 📋 Write tests
7. 📋 Update documentation

## Result
Users will be able to send screenshots and images to vision-capable LLMs for visual feedback on their projects, enabling use cases like:
- "What's wrong with this UI?"
- "How can I improve this design?"
- "Debug this error screenshot"
- "Implement this mockup"
