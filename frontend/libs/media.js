import { getStrapiURL } from './api';

export default function getStrapiMedia(media) {
  const imageUrl = media.url.startsWith('/')
    ? getStrapiURL(media.url)
    : media.url;
  return imageUrl;
}
