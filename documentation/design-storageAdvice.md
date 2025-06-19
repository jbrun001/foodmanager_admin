## Design overview: Food Storage Advice System

### Objective
Manages and displays food storage advice by ingredient type, usable by:
- admin interface (Node.js + EJS)
- Flutter app (read-only)

---

### Data Structure (Firestore)

Each **ingredient type** is stored as a document in the `StorageAdvice` collection:

```json
StorageAdvice (collection)
  ├── Dairy (document)
  │   ├── generalAdvice: "..."
  │   └── entries: [
  │         {
  │           "ingredient": "Milk",
  │           "advice": "Use within 3 days...",
  │           "test": "Smell for sour odor...",
  │           "lifeDays": 3
  │         },
  │         ...
  │     ]
```

#### Document fields:
- `generalAdvice` — string with general category guidance
- `entries[]` — array of ingredient-specific records:
  - `ingredient` — ingredient name
  - `advice` — specific storage instruction
  - `test` — how to check if spoiled
  - `lifeDays` — estimated shelf life in days

---

### Admin UI Overview (Node.js / EJS)

#### `GET /storageAdvice`
- Lists all types (`Dairy`, `Meat`, etc.)
- Displays `generalAdvice`, number of entries, and **Edit** links

#### `GET /storageAdvice/edit/:typeId`
- Loads `generalAdvice` and `entries[]` into a form
- Supports:
  - Editing `generalAdvice`
  - Editing/adding/removing entries
  - Autocomplete via `<datalist>` using known ingredient names

#### `POST /storageAdvice/edit/:typeId`
- Accepts serialized `entriesJson` from form
- Updates the Firestore document with:
  - `generalAdvice`
  - `entries[]`

---

### Integration with Flutter (prototype - needs re-working for app)

The Flutter app performs a single read:

```dart
final doc = await FirebaseFirestore.instance
  .collection('StorageAdvice')
  .doc('dairy')
  .get();

final generalAdvice = doc['generalAdvice'];
final entries = List<Map<String, dynamic>>.from(doc['entries']);
```

1 read per type to reduce database reads — general + entries combined.

---

### Benefits
| Feature          | Benefit                        |
|------------------|--------------------------------|
| Flat Structure   | Reduces Firestore reads        |
| Autocomplete     | Avoids typos, improves UX      |
