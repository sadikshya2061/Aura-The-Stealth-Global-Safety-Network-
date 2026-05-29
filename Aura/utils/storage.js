// Local Storage Utilities for saving emergency stories

const STORAGE_KEY = 'personal_safety_stories';

export const saveStory = (story) => {
  try {
    const stories = getStories();
    stories.unshift(story); // Add to beginning
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
    console.log('Story saved to local storage:', story);
    return true;
  } catch (error) {
    console.error('Error saving story:', error);
    return false;
  }
};

export const getStories = () => {
  try {
    const stories = localStorage.getItem(STORAGE_KEY);
    return stories ? JSON.parse(stories) : [];
  } catch (error) {
    console.error('Error getting stories:', error);
    return [];
  }
};

export const clearStories = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('Stories cleared from local storage');
    return true;
  } catch (error) {
    console.error('Error clearing stories:', error);
    return false;
  }
};

export const getStoryById = (id) => {
  try {
    const stories = getStories();
    return stories.find(story => story.id === id) || null;
  } catch (error) {
    console.error('Error getting story by id:', error);
    return null;
  }
};

export const deleteStory = (id) => {
  try {
    const stories = getStories().filter(story => story.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stories));
    return true;
  } catch (error) {
    console.error('Error deleting story:', error);
    return false;
  }
};