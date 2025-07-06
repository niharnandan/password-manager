<!-- CategoryTree.svelte -->
<script lang="ts">
    import { slide } from 'svelte/transition';
    import CategoryItem from './CategoryItem.svelte';
    
    export let categories: string[] = [];
    export let selectedCategory: string = 'all';
    export let onSelectCategory: (category: string) => void;
    
    // Parse categories to create a tree structure
    $: categoryTree = buildCategoryTree(categories);
    
    // Root categories (top level) - preserve the order from parent component
    $: rootCategories = categories.filter(cat => !cat.includes('/'));
    
    function buildCategoryTree(categories: string[]) {
      const tree: {[key: string]: string[]} = {};
      
      // Create a tree structure from flat category paths
      categories.forEach(category => {
        const parts = category.split('/');
        let currentLevel = tree;
        
        parts.forEach((part, index) => {
          const path = parts.slice(0, index + 1).join('/');
          if (!currentLevel[path]) {
            currentLevel[path] = [];
          }
        });
      });
      
      return tree;
    }
    
    // Check if a category has children
    function hasChildren(category: string): boolean {
      return Object.keys(categoryTree).some(path => 
        path !== category && path.startsWith(category + '/')
      );
    }
    
    // Get direct children of a category
    function getChildren(category: string): string[] {
      const directChildren: string[] = [];
      const prefix = category ? category + '/' : '';
      
      Object.keys(categoryTree)
        .filter(path => path.startsWith(prefix) && path !== category)
        .forEach(path => {
          const remaining = path.slice(prefix.length);
          const nextLevel = remaining.split('/')[0];
          const childPath = prefix + nextLevel;
          
          if (!directChildren.includes(childPath)) {
            directChildren.push(childPath);
          }
        });
      
      return directChildren.sort((a, b) => {
        // Extract just the category name after the last slash for comparison
        const aName = a.split('/').pop() || '';
        const bName = b.split('/').pop() || '';
        
        if (aName === "Uncategorized" && bName !== "Uncategorized") return -1;
        if (bName === "Uncategorized" && aName !== "Uncategorized") return 1;
        return aName.toLowerCase().localeCompare(bName.toLowerCase());
      });
    }
  </script>
  
  <div class="space-y-2">
    {#each rootCategories as category}
      <CategoryItem 
        {category} 
        {selectedCategory}
        {onSelectCategory}
        hasChildrenFn={hasChildren}
        getChildrenFn={getChildren}
      />
    {/each}
  </div>