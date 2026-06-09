# Patrons Section Setup Guide

## Overview
A new "Patrons" section has been added to the homepage, displaying 2 patron cards with circular profile images, names, and designations. The design matches the SIH website style with elegant cards and hover effects.

## Location
The Patrons section appears on the homepage after the "Tracks" section and before the "Collaboration" section.

---

## How to Add Patron Images

### Step 1: Prepare Images
1. Get high-quality photos of the 2 patrons
2. Recommended specifications:
   - **Format**: JPG or PNG
   - **Size**: At least 400x400 pixels (square)
   - **Aspect Ratio**: 1:1 (square)
   - **File size**: Under 500KB each for fast loading

### Step 2: Add Images to Public Folder
1. Copy the patron images to `frontend/public/` folder
2. Rename them to:
   - `patron-1.jpg` (or `.png`)
   - `patron-2.jpg` (or `.png`)

Example:
```
frontend/
  public/
    patron-1.jpg  ← First patron's photo
    patron-2.jpg  ← Second patron's photo
    logo.png
    skh3d.png
    ...
```

### Step 3: Update Patron Information
Edit `frontend/src/components/home/PatronsSection.jsx`:

```javascript
const patrons = [
  {
    id: 1,
    name: 'Dr. John Smith',              // ← Update with actual name
    designation: 'Vice Chancellor',      // ← Update with actual designation
    image: '/patron-1.jpg',              // ← Make sure filename matches
  },
  {
    id: 2,
    name: 'Prof. Jane Doe',              // ← Update with actual name
    designation: 'Director, Innovation', // ← Update with actual designation
    image: '/patron-2.jpg',              // ← Make sure filename matches
  },
]
```

---

## Customization Options

### Change Section Title
Edit in `PatronsSection.jsx`:
```javascript
<SectionHeading
  label="Our Patrons"           // ← Small label above title
  title="Leadership & Vision"   // ← Main heading
  description="Guided by visionaries..." // ← Subtitle
/>
```

### Add More Patrons (3 or 4)
If you need more than 2 patrons:

1. Add more objects to the `patrons` array
2. Update the grid layout:

```javascript
// Change this line (around line 58):
className="mt-16 grid gap-8 sm:grid-cols-2 lg:gap-12"

// For 3 patrons:
className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12"

// For 4 patrons:
className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12"
```

### Adjust Card Size
Image size (line 79):
```javascript
// Current: 160px (h-40 w-40)
className="... h-40 w-40 ..."

// Larger: 192px (h-48 w-48)
className="... h-48 w-48 ..."

// Smaller: 128px (h-32 w-32)
className="... h-32 w-32 ..."
```

---

## Design Features

### Card Design
- ✨ Gradient background with subtle color transitions
- 🎨 Rounded corners (rounded-3xl)
- 🖼️ Circular profile images with ring border
- 💫 Smooth hover animations (lift effect)
- 🌟 Decorative gradient underline on hover

### Responsive Design
- **Mobile**: 1 column
- **Tablet (sm)**: 2 columns
- **Desktop (lg)**: 2 columns (or 3/4 if you add more patrons)

### Accessibility
- Proper alt text for images
- Fallback placeholder if image fails to load
- Shows first letter of name if image is missing

---

## Testing

### 1. Local Development
```bash
cd frontend
npm run dev
```
Visit: http://localhost:5173/

### 2. Check Images Load
- Scroll to "Our Patrons" section
- Both patron cards should display
- Images should be circular and centered
- Hover over cards to see animations

### 3. Test Image Fallback
If image doesn't load, you'll see a placeholder with the patron's initial letter.

---

## File Structure

```
frontend/
├── public/
│   ├── patron-1.jpg         ← Add patron 1 photo here
│   └── patron-2.jpg         ← Add patron 2 photo here
├── src/
│   ├── components/
│   │   └── home/
│   │       ├── PatronsSection.jsx  ← Patron cards component
│   │       ├── Hero.jsx
│   │       ├── TracksSection.jsx
│   │       └── ...
│   └── pages/
│       └── LandingPage.jsx  ← Includes PatronsSection
```

---

## Example Patron Data

### Academic Leaders
```javascript
{
  id: 1,
  name: 'Dr. Rajesh Kumar',
  designation: 'Vice Chancellor, Sanjivani University',
  image: '/patron-1.jpg',
},
{
  id: 2,
  name: 'Prof. Anita Deshmukh',
  designation: 'Director, Innovation & Research',
  image: '/patron-2.jpg',
}
```

### Government Officials
```javascript
{
  id: 1,
  name: 'Hon. Minister Name',
  designation: 'Minister of Education, Maharashtra',
  image: '/patron-1.jpg',
},
{
  id: 2,
  name: 'IAS Officer Name',
  designation: 'District Collector, Kopargaon',
  image: '/patron-2.jpg',
}
```

---

## Troubleshooting

### Issue: Images Not Showing
**Causes:**
1. Image files not in `frontend/public/` folder
2. Wrong filename in code
3. Image format not supported

**Solution:**
1. Verify files exist: `frontend/public/patron-1.jpg` and `frontend/public/patron-2.jpg`
2. Check filename matches exactly (case-sensitive!)
3. Use JPG or PNG format only
4. Check browser console for 404 errors

### Issue: Images Look Distorted
**Cause:** Non-square images being forced into circular shape

**Solution:**
1. Crop images to square (1:1 aspect ratio) before uploading
2. Use photo editing tool to create 400x400px versions
3. Ensure face/subject is centered in the square

### Issue: Section Not Appearing
**Cause:** Component not imported or placed correctly

**Solution:**
1. Check `LandingPage.jsx` has the import
2. Verify `<PatronsSection />` is between `TracksSection` and `CollaborationSection`
3. Restart dev server: `npm run dev`

### Issue: Hover Effects Not Working
**Cause:** Framer Motion not installed or CSS conflicts

**Solution:**
1. Framer Motion should already be installed
2. Clear browser cache (Ctrl+Shift+R)
3. Check browser console for errors

---

## Push to GitHub

After adding images and updating patron information:

```bash
# Add the new component
git add frontend/src/components/home/PatronsSection.jsx

# Add the updated landing page
git add frontend/src/pages/LandingPage.jsx

# Add patron images (if you want them in Git - optional)
git add frontend/public/patron-1.jpg
git add frontend/public/patron-2.jpg

# Commit
git commit -m "Add Patrons section to homepage with 2 patron cards"

# Push
git push origin main
```

**Note**: You may want to keep patron images out of Git and upload them directly to your hosting service.

---

## Quick Start Checklist

- [ ] Add `patron-1.jpg` to `frontend/public/`
- [ ] Add `patron-2.jpg` to `frontend/public/`
- [ ] Update patron names in `PatronsSection.jsx`
- [ ] Update patron designations in `PatronsSection.jsx`
- [ ] Test locally: `npm run dev`
- [ ] Verify images load and look good
- [ ] Check hover animations work
- [ ] Test on mobile/tablet views
- [ ] Push to GitHub
- [ ] Deploy to production

---

**Last Updated**: June 9, 2026
