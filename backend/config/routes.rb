Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Defines the root path route ("/")
  # root "articles#index"
  namespace :api do
    namespace :v1 do
      resources :marchers
      resources :pages
      resources :marcher_pages, only: [:index]

      #paths to find marcher_pages
      resources :pages do
        # lookup marcher_pages by page
        get :marcher_pages, to: 'marcher_pages#index_by_page'
      end
      resources :marchers do
        # lookup marcher_pages by marcher
        get :marcher_pages, to: 'marcher_pages#index_by_marcher'
        resources :pages, only: [] do
          # lookup a marcher_pages by marcher and page
          get :marcher_pages, to: 'marcher_pages#index_by_marcher_and_page'
          # update a marcher_pages by marcher and page
          patch :marcher_pages, to: 'marcher_pages#update_marcher_page'
        end
      end
    end
  end
end
