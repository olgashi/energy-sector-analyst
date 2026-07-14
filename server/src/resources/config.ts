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
];

export function getResourceById(resourceId: string): Resource | undefined {
  return resources.find((resource) => resource.id === resourceId);
}
