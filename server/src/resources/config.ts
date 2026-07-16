export type Resource = {
  id: string;
  name: string;
  url: string;
  type: 'rss';
};

export const resources: Resource[] = [
  {
    id: 'utility-dive',
    name: 'Utility Dive',
    type: 'rss',
    url: 'https://www.utilitydive.com/feeds/news/',
  },
  {
    id: 'canary-media',
    name: 'Canary Media',
    type: 'rss',
    url: 'https://www.canarymedia.com/rss.rss',
  },
  {
    id: 'energy-storage-news',
    name: 'Energy-Storage.news',
    type: 'rss',
    url: 'https://www.energy-storage.news/feed/',
  },
  {
    id: 'cleantechnica',
    name: 'CleanTechnica',
    type: 'rss',
    url: 'https://cleantechnica.com/feed/',
  },
  {
    id: 'power-technology',
    name: 'Power Technology',
    type: 'rss',
    url: 'https://www.power-technology.com/feed/',
  },
];

export function getResourceById(resourceId: string): Resource | undefined {
  return resources.find((resource) => resource.id === resourceId);
}

export function listResources(): Resource[] {
  return resources;
}
