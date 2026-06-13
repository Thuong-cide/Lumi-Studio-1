---
name: Deliverables module
description: Full "Giao file chỉnh sửa" feature — versioned Drive folders + before/after slider.
---

## What was built

**DB schema** (`lib/db/src/schema/index.ts`):
- `albumsTable.deliverableRootFolderUrl` — optional root Drive folder URL
- `deliverablesTable` — (albumId, version int, versionLabel, driveFolderUrl, note)
- `deliverablePhotosTable` — (deliverableId, originalPhotoId FK→photos, editedImageUrl, caption)

**API** (`lib/api-spec/openapi.yaml` + codegen):
- `GET/POST /studios/albums/{id}/deliverables` — studio CRUD
- `GET /public/album/{slug}/deliverables` — public read
- Schemas: `Deliverable`, `DeliverablePhoto`, `DeliverableInput`, etc.
- Generated hooks: `useListDeliverables`, `useCreateDeliverable`, `useGetPublicDeliverables`

**Backend** (`artifacts/api-server/src/routes/deliverables.ts`):
- Registered in `routes/index.ts`
- `fetchDeliverablePhotos` helper does LEFT JOIN with photos table to populate `originalPhoto`

**Frontend**:
- `artifacts/lumiere/src/components/before-after-slider.tsx` — CSS clip-path slider, touch+mouse
- `artifacts/lumiere/src/components/album-deliverables-section.tsx` — studio form (react-hook-form useFieldArray) + version list
- Integrated at bottom of `artifacts/lumiere/src/pages/studio/albums/detail.tsx`
- `artifacts/lumiere/src/pages/public/gallery.tsx` — "Ảnh đã chỉnh sửa" section with version pills + slider grid

## Drive URL handling
Edited image URLs are stored as Drive share links (`https://drive.google.com/file/d/ID/...`).
`toDriveProxyUrl(url)` extracts the fileId via regex and routes through `/api/drive/proxy/:fileId`.
