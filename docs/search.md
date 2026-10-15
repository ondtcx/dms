# Search documents, optionally inside their content

Document search is metadata-only by default and gains an opt-in content pass. Both the advanced search and the documents list match the institutional number, and an exact number match is prioritized for relevance.

## Quick path

1. Leave `includeContent` unset (or `false`) for a metadata-only lookup.
2. Set `includeContent=true` to also match extracted text.
3. Provide the institutional number as the query to get an exact-number hit first.

```sh
# Metadata only (default)
curl "$API/search?query=acta%20consejo"

# Also search extracted content
curl "$API/search?query=acta%20consejo&includeContent=true"
```

## Behavior

| Topic                            | Rule                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default (`includeContent=false`) | Matches `name`, `filename`, `description` and `documentNumber`; rank uses an inline weighted Spanish vector (`A` name/filename + number, `B` description).                 |
| Opt-in (`includeContent=true`)   | Adds `extractedText` matching and the stored `searchVector`; rank uses the stored vector.                                                                                  |
| Institutional number             | Matched with `ILIKE` in every mode.                                                                                                                                        |
| Exact number priority            | For `sortBy=relevance`, a case-insensitive exact match on `documentNumber` is ordered first. Explicit sorts (`createdAt`, `updatedAt`, `filename`, `size`) are unaffected. |
| Validation                       | `includeContent` is a strict boolean; the string `"true"`/`"false"` is accepted, other text is rejected.                                                                   |
| List search                      | `DocumentService.findAll` adds the institutional number to its metadata `OR`; it never searches content.                                                                   |
| Permissions                      | Access and reception predicates are unchanged and still applied in every query.                                                                                            |

## OCR boundary

Extraction and indexing are untouched. The content flag only changes how a query matches and ranks; it never changes what is stored.

## Search history

The saved `relevantFilters` include `includeContent`, so a replayed search keeps the option.

## Frontend

The search page exposes an unchecked-by-default checkbox `Buscar también en el contenido`. When unchecked the parameter is absent from the URL; `includeContent=true` is restored from the URL, propagated to the request and query key, preserved across pagination, and cleared by `Limpiar filtros`.

## Checklist

- [ ] Default search returns metadata-only matches.
- [ ] `includeContent=true` also matches extracted text.
- [ ] An exact institutional number ranks first under relevance.
- [ ] Explicit sorts are unchanged by the number priority.
