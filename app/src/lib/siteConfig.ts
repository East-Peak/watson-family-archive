const treeName = process.env.NEXT_PUBLIC_TREE_NAME?.trim() || 'Family Tree';
const defaultTreeId = process.env.NEXT_PUBLIC_TREE_ID?.trim() || 'family-tree';
const rootPersonId = process.env.NEXT_PUBLIC_TREE_ROOT_PERSON?.trim() || null;
const shortTitle = treeName.replace(/\s+family tree$/i, '').trim() || treeName;

export const siteConfig = {
  title: treeName,
  shortTitle,
  description: `Explore ${treeName} across generations and continents`,
  tagline: 'Preserving family history for future generations',
  defaultTreeId,
  rootPersonId,
};
